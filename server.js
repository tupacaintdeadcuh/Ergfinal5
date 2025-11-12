import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ergsecret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, sameSite: 'lax', maxAge: 1000*60*60*24*7 }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

app.use(passport.initialize());
app.use(passport.session());

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/?auth=failed' }), (req, res) => res.redirect('/?auth=success'));
app.post('/logout', (req, res) => { req.logout(()=>{}); res.json({ ok:true }); });

app.get('/api/user', (req, res) => {
  if (!req.isAuthenticated()) return res.json({ loggedIn:false });
  const { id, username, discriminator, avatar } = req.user;
  res.json({ loggedIn:true, user:{ id, username, discriminator, avatar } });
});

function requireAuth(req, res, next){ if (req.isAuthenticated()) return next(); res.status(401).json({ error:'unauthenticated' }); }

async function sendWebhook(title, type, user, data){
  if (!WEBHOOK_URL) return;
  try{
    const embed = {
      title, color: 0x38bdf8,
      fields: [
        { name:'Type', value:type||'-', inline:true },
        { name:'User', value:user ? `${user.username}#${user.discriminator} (${user.id})` : '-', inline:true },
        { name:'Data', value:'```json\n'+JSON.stringify(data, null, 2).slice(0,1800)+'\n```' }
      ],
      timestamp: new Date().toISOString()
    };
    await fetch(WEBHOOK_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content:`ERG ${type} submission`, embeds:[embed] }) });
  }catch(e){ console.error('Webhook failed:', e.message); }
}

const recent=[]; function addRecent(row){ recent.unshift(row); if(recent.length>200) recent.pop(); }

app.post('/api/submit/application', requireAuth, async (req, res) => { const row={when:Date.now(),type:'application',user:req.user,data:req.body||{}}; addRecent(row); await sendWebhook('ERG Application','application',req.user,row.data); res.json({ok:true}); });
app.post('/api/submit/checkin', requireAuth, async (req, res) => { const row={when:Date.now(),type:'checkin',user:req.user,data:req.body||{}}; addRecent(row); await sendWebhook('ERG Weekly Check‑In','checkin',req.user,row.data); res.json({ok:true}); });
app.post('/api/submit/training', requireAuth, async (req, res) => { const row={when:Date.now(),type:'training',user:req.user,data:req.body||{}}; addRecent(row); await sendWebhook('ERG Training Update','training',req.user,row.data); res.json({ok:true}); });
app.post('/api/submit/promotion', requireAuth, async (req, res) => { const row={when:Date.now(),type:'promotion',user:req.user,data:req.body||{}}; addRecent(row); await sendWebhook('ERG Promotion Request','promotion',req.user,row.data); res.json({ok:true}); });
app.get('/api/admin/submissions', requireAuth, (req, res) => res.json({ rows: recent.slice(0,200) }));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`ERGTracking5 server running on port ${PORT}`));