import { useState, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

const SHEET_ID  = "1CkYLrFTwT1tMRDTqvvnc_u4TB2Wrn4KINd1uGmvfBlM";
const API_KEY   = "AIzaSyDPDMXabEQebhd_YK0Zn-M53qH5mFV-0QM";
const SHEETS_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1?key=${API_KEY}`;

const CATEGORIES = {
  "Food & Dining":        { color: "#F97316", icon: "🍽️" },
  "Transport":            { color: "#3B82F6", icon: "🚗" },
  "Shopping":             { color: "#A855F7", icon: "🛍️" },
  "EMI & Loans":          { color: "#EF4444", icon: "🏦" },
  "Entertainment":        { color: "#EC4899", icon: "🎬" },
  "Health":               { color: "#10B981", icon: "💊" },
  "Groceries":            { color: "#84CC16", icon: "🛒" },
  "Utilities":            { color: "#F59E0B", icon: "⚡" },
  "Investment":           { color: "#06B6D4", icon: "📈" },
  "Protein & Supplements":{ color: "#22D3EE", icon: "💪" },
  "Other":                { color: "#6B7280", icon: "📦" },
};

const CATEGORY_RULES = {
  "Food & Dining":        ["swiggy","zomato","coffee","cafe","restaurant","food","chai","biryani","pizza","burger","tea","lunch","dinner","breakfast","starbucks","mcdonalds","kfc","dominos","snacks","juice","bakery","boojee","blue tokai","third wave","subko"],
  "Transport":            ["uber","ola","rapido","auto","rickshaw","taxi","metro","bus","train","petrol","diesel","fuel","parking","toll","flight","irctc","redbus","cab","namma yatri"],
  "Groceries":            ["blinkit","zepto","bigbasket","dmart","grofers","instamart","vegetables","fruits","milk","grocery","kirana","supermarket","ration","reliance fresh","jiomart","boojee beans"],
  "Shopping":             ["amazon","flipkart","myntra","ajio","meesho","nykaa","clothing","clothes","shoes","fashion","mall","zara","h&m","westside","lifestyle","decathlon"],
  "EMI & Loans":          ["emi","loan","equitas","bajaj","home loan","car loan","personal loan","credit card","emi payment"],
  "Entertainment":        ["netflix","amazon prime","hotstar","disney","spotify","youtube premium","zee5","sonyliv","jiocinema","movie","cinema","pvr","inox","bookmyshow","games","concert","event"],
  "Health":               ["medicine","pharmacy","doctor","hospital","clinic","apollo","medplus","netmeds","pharmeasy","1mg","gym","fitness","yoga","cult","lab","test","scan","medical","dentist"],
  "Utilities":            ["electricity","water","gas","internet","broadband","mobile recharge","airtel","jio","vodafone","bsnl","dth","cable","maintenance","society","wifi","recharge","postpaid"],
  "Investment":           ["zerodha","groww","kuvera","coin","mutual fund","sip","stocks","shares","fd","fixed deposit","ppf","nps","gold","etf","investment","trading","smallcase","upstox"],
  "Protein & Supplements":["protein","whey","creatine","optimum nutrition","on whey","myprotein","muscleblaze","healthkart","supplement","bcaa","preworkout"],
};

function categorise(merchant, note = "") {
  const text = `${merchant} ${note}`.toLowerCase();
  for (const [cat, keys] of Object.entries(CATEGORY_RULES)) {
    if (keys.some(k => text.includes(k))) return cat;
  }
  return "Other";
}

async function fetchSheetData() {
  const res = await fetch(SHEETS_URL);
  if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
  return res.json();
}

function parseRows(data) {
  const rows = data.values || [];
  if (rows.length < 2) return [];
  return rows.slice(1).map((row, i) => {
    const merchant = row[2] || "";
    const note     = row[5] || "";
    const rawCat   = row[4] || "other";
    const category = rawCat.toLowerCase() === "other" ? categorise(merchant, note) : rawCat;
    return {
      id: row[0] || String(i),
      date: row[1] || new Date().toISOString().split("T")[0],
      merchant, amount: parseFloat(row[3]) || 0, category, note,
    };
  }).filter(e => e.amount > 0);
}

async function generateInsights(expenses, month, year) {
  if (!expenses.length) return "Add some expenses to get AI insights.";
  const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const total = expenses.reduce((s,e)=>s+e.amount,0);
  const summary = Object.entries(
    expenses.reduce((acc,e)=>{ acc[e.category]=(acc[e.category]||0)+e.amount; return acc; },{})
  ).map(([c,a])=>`${c}: ₹${a.toLocaleString("en-IN")}`).join(", ");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:800,
      messages:[{role:"user",content:`Personal finance advisor for Mumbai professional. ${MO[month]} ${year}:\nTotal: ₹${total.toLocaleString("en-IN")}\nCategories: ${summary}\nTransactions: ${expenses.length}\n\n3 sharp insights (2-3 sentences each): spend concentration, red flags, one actionable recommendation. India-context. No fluff.`}]
    })
  });
  const d = await res.json();
  return d.content[0].text;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = n => "₹" + Number(n).toLocaleString("en-IN");

// ── RESPONSIVE HOOK ───────────────────────────────────────────────────────────
function useBreakpoint() {
  const [bp, setBp] = useState("mobile");
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1024) setBp("desktop");
      else if (w >= 768) setBp("tablet");
      else setBp("mobile");
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return bp;
}

export default function ExpenseTracker() {
  const now = new Date();
  const bp  = useBreakpoint();
  const isDesktop = bp === "desktop";
  const isTablet  = bp === "tablet" || bp === "desktop";

  const [expenses, setExpenses]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [syncError, setSyncError] = useState("");
  const [lastSync, setLastSync]   = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selMonth, setSelMonth]   = useState(now.getMonth());
  const [selYear, setSelYear]     = useState(now.getFullYear());
  const [insights, setInsights]   = useState("");
  const [insightLoading, setIL]   = useState(false);
  const [toast, setToast]         = useState("");

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(""),3000); };

  const sync = useCallback(async (silent=false) => {
    if (!silent) setSyncing(true);
    setSyncError("");
    try {
      const data = await fetchSheetData();
      const parsed = parseRows(data);
      setExpenses(parsed);
      setLastSync(new Date());
      if (!silent) showToast(`Synced ${parsed.length} expenses ✓`);
    } catch(e) {
      setSyncError("Sync failed: " + e.message);
    }
    setSyncing(false);
    setLoading(false);
  }, []);

  useEffect(() => { sync(true); }, [sync]);

  const filtered = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth()===selMonth && d.getFullYear()===selYear;
  });
  const total = filtered.reduce((s,e)=>s+e.amount,0);
  const catTotals = Object.entries(
    filtered.reduce((acc,e)=>{ acc[e.category]=(acc[e.category]||0)+e.amount; return acc; },{})
  ).sort((a,b)=>b[1]-a[1]);
  const dailyData = Object.entries(
    filtered.reduce((acc,e)=>{ const d=new Date(e.date).getDate(); acc[d]=(acc[d]||0)+e.amount; return acc; },{})
  ).sort((a,b)=>+a[0]-+b[0]).map(([d,amt])=>({day:`${d}`,amount:amt}));

  if (loading) return (
    <div style={S.loadScreen}>
      <div style={S.spinner}/>
      <p style={{color:"#94A3B8",marginTop:16}}>Fetching from Google Sheets…</p>
    </div>
  );

  const header = (
    <header style={{...S.header, padding: isTablet ? "20px 32px 16px" : "16px 14px 12px"}}>
      <div>
        <div style={{...S.headerTitle, fontSize: isDesktop ? 28 : 22}}>Kharcha</div>
        <div style={S.headerSub}>{lastSync ? `Synced ${lastSync.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}` : "Not synced yet"}</div>
      </div>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <button style={S.syncBtn} onClick={()=>sync(false)} disabled={syncing}>{syncing?"⟳ …":"↻ Sync"}</button>
        <select style={S.monthPicker} value={`${selYear}-${selMonth}`}
          onChange={e=>{const[y,m]=e.target.value.split("-");setSelYear(+y);setSelMonth(+m);}}>
          {[0,1,2,3,4,5,6,7,8,9,10,11].map(m=>(
            <option key={`${now.getFullYear()}-${m}`} value={`${now.getFullYear()}-${m}`}>{MONTHS[m]} {now.getFullYear()}</option>
          ))}
          {[0,1,2,3,4,5,6,7,8,9,10,11].map(m=>(
            <option key={`${now.getFullYear()-1}-${m}`} value={`${now.getFullYear()-1}-${m}`}>{MONTHS[m]} {now.getFullYear()-1}</option>
          ))}
        </select>
      </div>
    </header>
  );

  const nav = (
    <nav style={{...S.nav, padding: isTablet ? "0 32px" : "0"}}>
      {["dashboard","transactions","categories"].map(tab=>(
        <button key={tab} style={{...S.navBtn,...(activeTab===tab?S.navActive:{}),...(isTablet?{fontSize:13,padding:"14px 8px"}:{})}} onClick={()=>setActiveTab(tab)}>
          {tab==="dashboard"?"📊 Dashboard":tab==="transactions"?"📋 History":"🏷️ Categories"}
        </button>
      ))}
    </nav>
  );

  const totalCard = (
    <div style={{...S.totalCard, padding: isDesktop ? "32px 40px" : "24px 20px"}}>
      <div style={S.totalLabel}>Total spent · {MONTHS[selMonth]} {selYear}</div>
      <div style={{...S.totalAmt, fontSize: isDesktop ? 52 : 38}}>{fmt(total)}</div>
      <div style={S.totalSub}>{filtered.length} transactions</div>
    </div>
  );

  const categorySection = (
    <section style={S.section}>
      <h3 style={S.sectionTitle}>By Category</h3>
      <div style={{display:"flex", alignItems:"center", gap:16, flexWrap: isTablet ? "nowrap" : "wrap"}}>
        <ResponsiveContainer width={isDesktop ? 220 : isTablet ? 200 : "45%"} height={isDesktop ? 220 : 180}>
          <PieChart>
            <Pie data={catTotals.map(([n,v])=>({name:n,value:v}))} dataKey="value" cx="50%" cy="50%" outerRadius={isDesktop?90:70} innerRadius={isDesktop?55:40}>
              {catTotals.map(([n])=><Cell key={n} fill={CATEGORIES[n]?.color||"#6B7280"}/>)}
            </Pie>
            <Tooltip formatter={v=>fmt(v)} contentStyle={{background:"#1E293B",border:"1px solid #334155",borderRadius:8,color:"#F1F5F9"}}/>
          </PieChart>
        </ResponsiveContainer>
        <div style={{flex:1, display:"flex", flexDirection:"column", gap: isDesktop ? 10 : 7}}>
          {catTotals.map(([n,a])=>(
            <div key={n} style={{...S.catRow, fontSize: isDesktop ? 13 : 12}}>
              <div style={S.catDot(CATEGORIES[n]?.color)}/>
              <span style={S.catName}>{CATEGORIES[n]?.icon} {n}</span>
              <span style={S.catAmt}>{fmt(a)}</span>
              <span style={S.catPct}>{total?Math.round(a/total*100):0}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const dailySection = dailyData.length > 1 && (
    <section style={S.section}>
      <h3 style={S.sectionTitle}>Daily Spend</h3>
      <ResponsiveContainer width="100%" height={isDesktop ? 220 : 160}>
        <BarChart data={dailyData} margin={{top:4,right:8,left:0,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B"/>
          <XAxis dataKey="day" tick={{fill:"#64748B",fontSize:11}}/>
          <YAxis tick={{fill:"#64748B",fontSize:11}} tickFormatter={v=>`₹${v>=1000?v/1000+"k":v}`}/>
          <Tooltip formatter={v=>fmt(v)} labelFormatter={d=>`Day ${d}`} contentStyle={{background:"#1E293B",border:"1px solid #334155",borderRadius:8,color:"#F1F5F9"}}/>
          <Bar dataKey="amount" fill="#6366F1" radius={[4,4,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );

  const merchantSection = (
    <section style={S.section}>
      <h3 style={S.sectionTitle}>Top Merchants</h3>
      {Object.entries(filtered.reduce((acc,e)=>{acc[e.merchant]=(acc[e.merchant]||0)+e.amount;return acc;},{}))
        .sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,a])=>(
        <div key={n} style={{...S.merchantRow, marginBottom: isDesktop ? 14 : 10}}>
          <span style={{...S.merchantName, width: isDesktop ? 140 : 90}}>{n}</span>
          <div style={S.merchantBar}><div style={{...S.merchantFill,width:`${Math.round(a/total*100)}%`}}/></div>
          <span style={S.merchantAmt}>{fmt(a)}</span>
        </div>
      ))}
    </section>
  );

  const insightsSection = (
    <section style={S.section}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <h3 style={{...S.sectionTitle,marginBottom:0}}>AI Insights</h3>
        <button style={S.btnSmall} onClick={async()=>{setIL(true);setInsights("");const t=await generateInsights(filtered,selMonth,selYear);setInsights(t);setIL(false);}} disabled={insightLoading}>
          {insightLoading?"Analysing…":"✨ Analyse"}
        </button>
      </div>
      {insights
        ? <div style={S.insightBox}>{insights.split("\n").filter(l=>l.trim()).map((l,i)=><p key={i} style={{margin:"6px 0",lineHeight:1.7,color:l.match(/^\d\./)?"#A5B4FC":"#CBD5E1",fontSize: isDesktop ? 14 : 13}}>{l}</p>)}</div>
        : <div style={S.insightPlaceholder}>Hit "Analyse" for AI insights on your {MONTHS[selMonth]} spending.</div>
      }
    </section>
  );

  const emptyState = (
    <div style={S.empty}>
      <div style={{fontSize:56}}>💸</div>
      <p style={{color:"#64748B",fontSize:15}}>No expenses for this month yet.</p>
      <p style={{color:"#475569",fontSize:13,textAlign:"center"}}>Message your Telegram bot, then hit Sync.</p>
      <button style={S.btnPrimary} onClick={()=>sync(false)}>↻ Sync Now</button>
    </div>
  );

  const dashboardContent = filtered.length === 0 ? emptyState : (
    isDesktop ? (
      // ── DESKTOP: 2-column layout ──
      <div>
        {totalCard}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
          <div>
            {categorySection}
            {merchantSection}
          </div>
          <div>
            {dailySection}
            {insightsSection}
          </div>
        </div>
      </div>
    ) : isTablet ? (
      // ── TABLET: wider single column with bigger charts ──
      <div>
        {totalCard}
        {categorySection}
        {dailySection}
        {merchantSection}
        {insightsSection}
      </div>
    ) : (
      // ── MOBILE: compact single column ──
      <div>
        {totalCard}
        {categorySection}
        {dailySection}
        {merchantSection}
        {insightsSection}
      </div>
    )
  );

  const transactionsContent = (
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h3 style={{...S.sectionTitle,marginBottom:0,fontSize: isDesktop ? 15 : 13}}>{MONTHS[selMonth]} {selYear} · {filtered.length} entries</h3>
        <span style={S.badge}>{fmt(total)}</span>
      </div>
      {filtered.length===0
        ? <div style={S.empty}><div style={{fontSize:40}}>📭</div><p style={{color:"#64748B"}}>No transactions this month.</p></div>
        : isDesktop ? (
          // Desktop: table layout
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:"1px solid #1E293B"}}>
                {["","Date","Merchant","Category","Amount","Note"].map(h=>(
                  <th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,color:"#475569",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...filtered].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(exp=>(
                <tr key={exp.id} style={{borderBottom:"1px solid #1E293B"}}>
                  <td style={{padding:"12px 12px",fontSize:20}}>{CATEGORIES[exp.category]?.icon||"📦"}</td>
                  <td style={{padding:"12px 12px",fontSize:13,color:"#64748B"}}>{exp.date}</td>
                  <td style={{padding:"12px 12px",fontSize:14,fontWeight:600,color:"#F1F5F9"}}>{exp.merchant}</td>
                  <td style={{padding:"12px 12px",fontSize:13,color:"#94A3B8"}}>{exp.category}</td>
                  <td style={{padding:"12px 12px",fontSize:14,fontWeight:700,color:"#A5B4FC"}}>{fmt(exp.amount)}</td>
                  <td style={{padding:"12px 12px",fontSize:13,color:"#64748B"}}>{exp.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          // Mobile/tablet: card layout
          [...filtered].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(exp=>(
            <div key={exp.id} style={S.txRow}>
              <div style={S.txIcon}>{CATEGORIES[exp.category]?.icon||"📦"}</div>
              <div style={S.txInfo}>
                <div style={{...S.txMerchant, fontSize: isTablet ? 15 : 14}}>{exp.merchant}</div>
                <div style={S.txMeta}>{exp.category} · {exp.date}{exp.note?` · ${exp.note}`:""}</div>
              </div>
              <div style={{...S.txAmt, fontSize: isTablet ? 16 : 15}}>{fmt(exp.amount)}</div>
            </div>
          ))
        )
      }
    </>
  );

  const categoriesContent = (
    <>
      <div style={S.section}>
        <h3 style={S.sectionTitle}>Auto-categorisation Rules</h3>
        <p style={{color:"#64748B",fontSize:13,marginBottom:16}}>Merchants matched using these keywords on every sync.</p>
        <div style={isDesktop ? {display:"grid",gridTemplateColumns:"1fr 1fr",gap:16} : {}}>
          {Object.entries(CATEGORY_RULES).map(([cat,keys])=>(
            <div key={cat} style={S.ruleRow}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                <div style={S.catDot(CATEGORIES[cat]?.color)}/>
                <span style={{fontSize: isDesktop ? 14 : 13,fontWeight:600,color:"#E2E8F0"}}>{CATEGORIES[cat]?.icon} {cat}</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {keys.slice(0,8).map(k=><span key={k} style={S.keyword}>{k}</span>)}
                {keys.length>8 && <span style={{color:"#475569",fontSize:11,padding:"2px 4px"}}>+{keys.length-8} more</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={S.telegramCard}>
        <div style={{fontSize:14,fontWeight:700,color:"#60A5FA",marginBottom:12}}>📱 Message format</div>
        <div style={isDesktop ? {display:"grid",gridTemplateColumns:"1fr 1fr",gap:8} : {}}>
          {[["coffee 200","Food & Dining · ₹200"],["uber 350 airport","Transport · ₹350"],["blinkit 650","Groceries · ₹650"],["netflix 649","Entertainment · ₹649"],["emi 15000","EMI & Loans · ₹15,000"],["whey 2500","Protein & Supplements · ₹2,500"]].map(([msg,res])=>(
            <div key={msg} style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
              <code style={{background:"#1E293B",color:"#A5B4FC",borderRadius:6,padding:"3px 8px",fontSize:12,fontFamily:"monospace",whiteSpace:"nowrap"}}>{msg}</code>
              <span style={{fontSize:12,color:"#93C5FD"}}>→ {res}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div style={{...S.app, maxWidth: isDesktop ? "1200px" : isTablet ? "768px" : "480px"}}>
      {toast && <div style={S.toast}>{toast}</div>}
      {header}
      {syncError && <div style={S.errorBanner}>⚠️ {syncError}</div>}
      {nav}
      <main style={{...S.main, padding: isDesktop ? "24px 32px 60px" : isTablet ? "20px 24px 60px" : "16px 14px 80px"}}>
        {activeTab==="dashboard"    && dashboardContent}
        {activeTab==="transactions" && transactionsContent}
        {activeTab==="categories"   && categoriesContent}
      </main>
    </div>
  );
}

const S = {
  app:{background:"#0B1120",minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:"#F1F5F9",margin:"0 auto"},
  loadScreen:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0B1120"},
  spinner:{width:32,height:32,border:"3px solid #1E293B",borderTop:"3px solid #6366F1",borderRadius:"50%",animation:"spin 0.8s linear infinite"},
  toast:{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#6366F1",color:"#fff",padding:"10px 24px",borderRadius:24,fontSize:13,fontWeight:500,zIndex:999,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(99,102,241,0.4)"},
  errorBanner:{background:"#1F0A0A",border:"1px solid #7F1D1D",color:"#FCA5A5",padding:"10px 16px",fontSize:12},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #1E293B"},
  headerTitle:{fontWeight:700,letterSpacing:"-0.5px",color:"#fff"},
  headerSub:{fontSize:11,color:"#475569",marginTop:2},
  syncBtn:{background:"#1E293B",color:"#94A3B8",border:"1px solid #334155",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer"},
  monthPicker:{background:"#1E293B",color:"#CBD5E1",border:"1px solid #334155",borderRadius:8,padding:"7px 10px",fontSize:12,cursor:"pointer"},
  nav:{display:"flex",borderBottom:"1px solid #1E293B"},
  navBtn:{flex:1,padding:"12px 4px",background:"none",border:"none",color:"#64748B",fontSize:12,fontWeight:500,cursor:"pointer"},
  navActive:{color:"#6366F1",borderBottom:"2px solid #6366F1"},
  main:{},
  totalCard:{background:"linear-gradient(135deg,#1E1B4B,#1E293B)",border:"1px solid #312E81",borderRadius:16,marginBottom:20,textAlign:"center"},
  totalLabel:{fontSize:11,color:"#818CF8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8},
  totalAmt:{fontWeight:700,color:"#fff",letterSpacing:"-1px"},
  totalSub:{fontSize:12,color:"#475569",marginTop:6},
  section:{background:"#111827",border:"1px solid #1E293B",borderRadius:14,padding:"18px 16px",marginBottom:16},
  sectionTitle:{fontSize:13,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:14},
  empty:{textAlign:"center",padding:"60px 20px",display:"flex",flexDirection:"column",alignItems:"center",gap:14},
  catRow:{display:"flex",alignItems:"center",gap:8},
  catDot:c=>({width:9,height:9,borderRadius:"50%",background:c||"#6B7280",flexShrink:0}),
  catName:{flex:1,color:"#CBD5E1"},
  catAmt:{color:"#fff",fontWeight:600},
  catPct:{color:"#475569",fontSize:11,width:32,textAlign:"right"},
  merchantRow:{display:"flex",alignItems:"center",gap:12},
  merchantName:{flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13,color:"#CBD5E1"},
  merchantBar:{flex:1,height:6,background:"#1E293B",borderRadius:3,overflow:"hidden"},
  merchantFill:{height:"100%",background:"#6366F1",borderRadius:3},
  merchantAmt:{fontSize:13,color:"#A5B4FC",fontWeight:600,width:80,textAlign:"right"},
  insightBox:{background:"#0F172A",border:"1px solid #1E293B",borderRadius:10,padding:"16px"},
  insightPlaceholder:{color:"#475569",fontSize:13,fontStyle:"italic",textAlign:"center",padding:"20px 0"},
  btnPrimary:{background:"#6366F1",color:"#fff",border:"none",borderRadius:10,padding:"12px 24px",fontSize:13,fontWeight:600,cursor:"pointer"},
  btnSmall:{background:"#312E81",color:"#A5B4FC",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"},
  badge:{background:"#1E293B",color:"#A5B4FC",borderRadius:8,padding:"5px 12px",fontSize:13,fontWeight:700},
  txRow:{display:"flex",alignItems:"flex-start",gap:14,padding:"14px 0",borderBottom:"1px solid #1E293B"},
  txIcon:{fontSize:22,width:36,textAlign:"center",flexShrink:0},
  txInfo:{flex:1,minWidth:0},
  txMerchant:{fontWeight:600,color:"#F1F5F9"},
  txMeta:{fontSize:11,color:"#64748B",marginTop:3},
  txAmt:{fontWeight:700,color:"#A5B4FC",flexShrink:0},
  ruleRow:{marginBottom:14,paddingBottom:14,borderBottom:"1px solid #1E293B"},
  keyword:{background:"#1E293B",color:"#64748B",borderRadius:12,padding:"3px 9px",fontSize:11},
  telegramCard:{background:"#0C1F3F",border:"1px solid #1D3A6E",borderRadius:14,padding:"18px"},
};
