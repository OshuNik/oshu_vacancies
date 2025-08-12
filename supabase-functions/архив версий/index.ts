// index.ts — кликабельные ссылки, поддержка tg://, извлечение apply_url/company_url, fix <br>

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SERVICE_KEY")  ?? "";
const AI_API_KEY   = Deno.env.get("AI_API_KEY")   ?? "";
const supabase = (SUPABASE_URL && SERVICE_KEY) ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

const asStr=(v:unknown)=> (v==null?"":String(v)).trim();
const asArr=(v:unknown)=> Array.isArray(v)?v.map(asStr).filter(Boolean):asStr(v).split(/[;,]\s*/g).map(asStr).filter(Boolean);
const escapeHtml=(s:string)=> s.replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!));
const escapeRe=(s:string)=> s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const tsIso=(v:unknown)=>{const s=asStr(v); if(!s) return new Date().toISOString(); const d=new Date(s); return isNaN(d.getTime())?new Date().toISOString():d.toISOString();};
const isHttp=(u:string)=>/^https?:\/\//i.test(u);
const isTg  =(u:string)=>/^tg:\/\//i.test(u);
const isHttpOrTg=(u:string)=> isHttp(u)||isTg(u);
const safeHttp=(v:unknown)=>{const s=asStr(v); if(!s) return ""; try{const u=new URL(s); return /^https?:$/i.test(u.protocol)?u.toString():"";}catch{return "";}};
const safeHttpOrTg=(v:unknown)=>{const s=asStr(v); if(!s) return ""; try{const u=new URL(s); return (/^https?:$|^tg:$/i.test(u.protocol))?u.toString():"";}catch{return "";}};
const isTelegramPostUrl=(url:string)=>{try{const u=new URL(url); if(u.protocol==="tg:") return false; if(u.hostname!=="t.me"&&u.hostname!=="telegram.me") return false; const parts=u.pathname.split("/").filter(Boolean); return parts.length>=2 && /^\d+/.test(parts[1]||"");}catch{return false;}};
const stripTags=(s:string)=> s.replace(/<[^>]*>/g,"");

function makeAnchor(url:string,label:string){
  const href=safeHttpOrTg(url);
  if(!href) return escapeHtml(label);
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}
function extractInlineLinksToPlaceholders(raw:string){
  const anchors:string[]=[]; let text=raw;
  text=text.replace(/\[([^\]]+)\]\(((?:https?:\/\/|tg:\/\/)[^\s)<>"]+)\)/gi,(_m,label,href)=>{const ph=`__A${anchors.length}__`; anchors.push(makeAnchor(href,String(label))); return ph;});
  text=text.replace(/<a\s+[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(_m,href,label)=>{const ph=`__A${anchors.length}__`; anchors.push(makeAnchor(href,stripTags(String(label)))); return ph;});
  return { text, anchors };
}
function linkify(html:string){
  return html
    .replace(/\b(?:https?:\/\/|tg:\/\/)[^\s<>'")]+/gi,m=>`<a href="${safeHttpOrTg(m)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m)}</a>`)
    .replace(/(^|\s)@([a-zA-Z0-9_]{3,32})\b/g,(_m,p1,u)=>`${p1}<a href="https://t.me/${u}" target="_blank" rel="noopener noreferrer">@${u}</a>`)
    .replace(/\*\*([^\*]+)\*\*/g,"<strong>$1</strong>")
    .replace(/\n/g,"<br>");
}
const highlight=(html:string,kw:string)=> kw.trim()? html.replace(new RegExp(escapeRe(kw),"gi"),m=>`<span class="highlight">${m}</span>`):html;
function normCat(raw:string):"ТОЧНО ТВОЁ"|"МОЖЕТ БЫТЬ"|"НЕ ТВОЁ"{const s=asStr(raw).toUpperCase(); if(s.includes("ТОЧН"))return"ТОЧНО ТВОЁ"; if(s.includes("МОЖЕТ"))return"МОЖЕТ БЫТЬ"; return"НЕ ТВОЁ";}
function extractTelegramHandle(text:string){const re=/(^|[^@\w])@([A-Za-z0-9_]{3,32})\b/g; let m:RegExpExecArray|null; while((m=re.exec(text))!==null){const user=m[2]; if(user) return `https://t.me/${user}`;} return "";}
function extractApplyLinkFromText(rawText:string){
  const text=rawText.replace(/[\u200B-\u200D\uFEFF]/g,"").replace(/[（﹙⟮]/g,"(").replace(/[）﹚⟯]/g,")").replace(/\u00A0/g," ");
  const trigger=/(отклик|откликнуться|написать|связаться|apply|respond|response|contact|feedback|заявка)/i;
  const parenRe=new RegExp(`${trigger.source}\\s*\\(([^)]+)\\)`,"gi"); let m:RegExpExecArray|null;
  while((m=parenRe.exec(text))!==null){const inside=(m[2]||m[1]||"").trim(); const hit=(inside.match(/(?:https?:\/\/|tg:\/\/)[^\s<>'")]+/i)||[])[0]; if(hit) return hit;}
  const mdHrefs=Array.from(text.matchAll(/\[[^\]]+]\(((?:https?:\/\/|tg:\/\/)[^\s)<>"]+)\)/gi)).map(m=>m[1]);
  const aHrefs =Array.from(text.matchAll(/<a\s+[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi)).map(m=>m[1]);
  const rawLinks=(text.match(/\b(?:https?:\/\/|tg:\/\/)[^\s<>'")]+/gi)||[]).map(String);
  const all=[...mdHrefs,...aHrefs,...rawLinks];
  const prefs=[/forms\.gle/i,/docs\.google\.com\/forms/i,/typeform\.com/i,/forms\.yandex/i,/hh\.ru/i,/career\./i,/lever\.co/i,/workable\.com/i,/greenhouse\.io/i,/notion\.site/i];
  for(const re of prefs){const f=all.find(u=>re.test(u)&&isHttpOrTg(u)); if(f) return f;}
  const tg = all.find(u=> isTg(u) || ((/t\.me|telegram\.me/i.test(u)) && !isTelegramPostUrl(u)) ); if(tg) return tg;
  const handle=extractTelegramHandle(text); if(handle) return handle;
  return all.find(isHttpOrTg)||"";
}
function extractCompanyUrl(text:string, companyName:string){
  const mdHrefs=Array.from(text.matchAll(/\[[^\]]+]\((https?:\/\/[^\s)<>"]+)\)/gi)).map(m=>m[1]);
  const aHrefs =Array.from(text.matchAll(/<a\s+[^>]*?href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi)).map(m=>m[1]);
  const links=[...mdHrefs,...aHrefs,...(text.match(/\bhttps?:\/\/[^\s)'"<>]+/gi)||[])];
  const bad=/(t\.me|telegram\.me|forms\.gle|docs\.google\.com\/forms|typeform\.com|hh\.ru|notion\.site)/i;
  const candidates=links.filter(u=>safeHttp(u)&&!bad.test(u)); if(!candidates.length) return "";
  if(companyName){const token=companyName.toLowerCase().split(/\s+/).filter(Boolean)[0]||""; try{const byName=candidates.find(u=>new URL(u).hostname.toLowerCase().includes(token)); if(byName) return byName;}catch{}}
  return candidates[0];
}

async function openaiStrict(body:any,retries=2){
  const url="https://api.openai.com/v1/chat/completions"; let last:any=null;
  for(let i=0;i<=retries;i++){try{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${AI_API_KEY}`},body:JSON.stringify(body)}); if(!r.ok) throw new Error(`AI ${r.status} ${await r.text()}`); return await r.json();}catch(e){last=e; await new Promise(r=>setTimeout(r,500*(i+1)));}}
  throw last ?? new Error("AI failed");
}

const SYSTEM_PROMPT = `
Ты — ассистент по фильтрации вакансий (моушн/монтаж). Верни СТРОГО JSON как в примере.
{
  "category": "ТОЧНО ТВОЁ" | "МОЖЕТ БЫТЬ" | "НЕ ТВОЁ",
  "reason": "коротко",
  "apply_url": "https://... | tg://..." | "",
  "company_url": "https://..." | "",
  "company_name": "строка | 'не указано'",
  "skills": ["до 6"],
  "employment_type": "проект / частичная / полная / стажировка / не указано",
  "work_format": "удалёнка / офис / гибрид / не указано",
  "salary_display_text": "строка | 'не указано'",
  "industry": "строка | 'не указано'"
}
Правила: apply_url — формы/карьеры/hh/ATS/Notion, либо tg:// профиль/бот (НЕ пост t.me/chan/id). company_url — сайт компании. Только JSON.
`.trim();

serve(async (req)=>{
  try{
    if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors()});
    if(req.method!=="POST")   return json({error:"Method Not Allowed"},405);
    if(!supabase||!AI_API_KEY) return json({error:"Server not configured"},500);

    const body=await req.json().catch(()=>({}));
    const text=asStr(body.text);
    const channel=asStr(body.channel);
    const keyword=asStr(body.keyword);
    const has_image=Boolean(body.has_image);
    const timestamp=tsIso(body.timestamp);
    const messageLink=safeHttp(body.message_link);

    const extracted=extractInlineLinksToPlaceholders(text);
    let html=escapeHtml(extracted.text);
    // разрешаем <br>
    html=html.replace(/&lt;br\s*\/?&gt;/gi,"<br>");
    html=linkify(html);
    extracted.anchors.forEach((a,i)=>{ html=html.replaceAll(`__A${i}__`,a); });
    html=highlight(html,keyword);
    const text_highlighted=html;

    const aiRes=await openaiStrict({
      model:"gpt-4o-mini",
      messages:[{role:"system",content:SYSTEM_PROMPT},{role:"user",content:text}],
      response_format:{type:"json_object"}
    });
    const parsed=JSON.parse(aiRes.choices?.[0]?.message?.content||"{}");

    let applyUrl=safeHttpOrTg(parsed?.apply_url)||extractApplyLinkFromText(text);
    if(applyUrl && !isTg(applyUrl) && isTelegramPostUrl(applyUrl)) applyUrl="";

    let companyUrl=safeHttp(parsed?.company_url);
    if(!companyUrl) companyUrl=safeHttp(extractCompanyUrl(text,asStr(parsed?.company_name)));

    const row={
      channel, keyword, timestamp, message_link:messageLink, has_image, text_highlighted,
      category: (():any=>{const s=asStr(parsed?.category).toUpperCase(); if(s.includes("ТОЧН")) return "ТОЧНО ТВОЁ"; if(s.includes("МОЖЕТ")) return "МОЖЕТ БЫТЬ"; return "НЕ ТВОЁ";})(),
      reason:asStr(parsed?.reason),
      apply_url:applyUrl,
      skills:asArr(parsed?.skills),
      employment_type:asStr(parsed?.employment_type),
      work_format:asStr(parsed?.work_format),
      salary_display_text:asStr(parsed?.salary_display_text),
      industry:asStr(parsed?.industry),
      company_name:asStr(parsed?.company_name),
      company_url:companyUrl,
      status:"new"
    };

    if(row.message_link){
      const {data:ex}=await supabase.from("vacancies").select("id").eq("message_link",row.message_link).limit(1).maybeSingle();
      if(ex?.id){ const {error}=await supabase.from("vacancies").update(row).eq("id",ex.id); if(error) throw error; return json({ok:true,id:ex.id});}
    }
    const {data:ins,error:insErr}=await supabase.from("vacancies").insert(row).select("id").single();
    if(insErr) throw insErr;
    return json({ok:true,id:ins.id});
  }catch(e:any){
    console.error("process-vacancy error:", e?.message||e);
    return json({ok:false,error:String(e?.message||e)},500);
  }
},{onListen:()=>console.log("process-vacancy ready")});

function cors(){return{
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};}
function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json",...cors()}});
}
