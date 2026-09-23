// POST /api/assessment
// Captures Content Automation Score leads and sends them through the existing AIR Waves Resend setup.
// Requires RESEND_API_KEY in this Vercel project's environment variables.
const FROM = process.env.LEAD_FROM || 'AIR Waves <octavia@contact.airwavesent.com>';
const ALERT_TO = process.env.LEAD_ALERT_EMAIL || process.env.ALERT_EMAIL || 'sales@airwavesent.com';
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clip=(s='',n=255)=>String(s).trim().slice(0,n);
export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
 let b;
 try{b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}catch{return res.status(400).json({error:'Invalid request.'});}
 const email=clip(b.email), name=clip(b.name,100);
 if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({error:'Valid name and email are required.'});
 const key=process.env.RESEND_API_KEY;if(!key)return res.status(500).json({error:'Email capture is not configured on this deployment.'});
 const lead={email,name,score:Number(b.score)||0,persona:clip(b.persona,50),pain:clip(b.pain,50),goal:clip(b.goal,50),revenue:clip(b.revenue,50),hours:clip(b.hours,20),source:'content-automation-score'};
 const send=async payload=>fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 if(b.action==='research'){
   const research={...lead,productInterest:clip(b.productInterest,160),price:clip(b.price,80),taskToRemove:clip(b.magic,2000)};
   if(!research.productInterest||!research.price)return res.status(400).json({error:'Choose what you need help with and a price.'});
   const rows=Object.entries(research).map(([k,v])=>`<tr><td style="padding:5px 12px"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
   try{
     const alert=await send({from:FROM,to:[ALERT_TO],reply_to:email,subject:`Content Automation research — ${research.score}/100 — ${name}`,html:`<h2>Assessment follow-up answers</h2><table>${rows}</table>`});
     if(!alert.ok)throw new Error('research alert '+alert.status+' '+await alert.text());
     return res.status(200).json({ok:true});
   }catch(e){console.error('research capture failed',e);return res.status(502).json({error:'Could not send your answers right now. Please try again.'});}
 }
 if(b.action)return res.status(400).json({error:'Invalid request.'});
 const resultTitle=clip(b.resultTitle,160);
 const userHtml=`<div style="background:#090909;color:#fff;padding:32px;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto"><div style="color:#c7ff00;font-weight:800;letter-spacing:.12em">AIR WAVES</div><h1 style="font-size:40px;margin-bottom:8px">Your score: ${lead.score}/100</h1><h2>${esc(resultTitle)}</h2><p style="color:#ddd;line-height:1.7">Your biggest content bottleneck is <b style="color:#c7ff00">${esc(lead.pain)}</b>, and your main goal is <b>${esc(lead.goal)}</b>.</p><p style="color:#ddd;line-height:1.7">This is the beginning of your personalized AIR Waves content-system roadmap. We'll send practical ways to remove busywork without automating the part that makes your content yours.</p><p style="color:#c7ff00;font-weight:700">Automate the labor. Keep the human.</p></div></div>`;
 try{
   const welcome=await send({from:FROM,to:[email],subject:`Your Content Automation Score: ${lead.score}/100`,html:userHtml});
   if(!welcome.ok) throw new Error('welcome '+welcome.status+' '+await welcome.text());
   // Internal notification doubles as durable lead notification until CRM/contact-property wiring is added.
   const rows=Object.entries(lead).map(([k,v])=>`<tr><td style="padding:5px 12px"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
   const alert=await send({from:FROM,to:[ALERT_TO],reply_to:email,subject:`New Content Automation lead — ${lead.score}/100 — ${name}`,html:`<h2>New assessment lead</h2><table>${rows}</table>`});
   if(!alert.ok) console.error('lead alert failed',alert.status,await alert.text());
   return res.status(200).json({ok:true});
 }catch(e){console.error('assessment capture failed',e);return res.status(502).json({error:'Could not save your assessment right now.'});}
}
