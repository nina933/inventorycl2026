
// Deployment URL (NOT THE ACTUAL Google App Script)
// No API keys in danger, only our catalog and inventory. 
const URL_AS='https://script.google.com/macros/s/AKfycbz1VxL0PwyXBgxEiP6FuiGiuTN9abahOfc0D6ZiRoPnkaGUmSvUDz7PzDAmsSIgxDapJA/exec';




// =====================================================================
// GLOBAL SAFETY NET (Error Catcher)
// =====================================================================
// Red banner at the top of the screen if the app crashes. 

function showVisualError(msg) {
    // 1. Hide the loading screen if it's currently stuck
    const lov = document.getElementById('lov');
    if (lov) lov.style.display = 'none';

    // 2. Create the red banner if it doesn't exist yet
    let errDiv = document.getElementById('global-error-banner');
    if (!errDiv) {
        errDiv = document.createElement('div');
        errDiv.id = 'global-error-banner';
        errDiv.style.cssText = 'position:fixed; top:0; left:0; width:100%; background:var(--re, #d93025); color:white; padding:15px; text-align:center; z-index:999999; font-weight:500; box-shadow:0 4px 6px rgba(0,0,0,0.2);';
        document.body.prepend(errDiv);
    }
    
    // 3. Inject the error message and a close button
    errDiv.innerHTML = `⚠️ <b>Erreur Système :</b> ${msg} 
        <button onclick="this.parentElement.style.display='none'" style="margin-left:15px; padding:6px 12px; cursor:pointer; background:white; color:#d93025; border:none; border-radius:4px; font-weight:bold;">Fermer</button>`;
    errDiv.style.display = 'block';
}

// Listen for standard code crashes (Syntax errors, undefined variables)
window.onerror = function(message, source, lineno, colno, error) {
    showVisualError(`Un problème inattendu est survenu (${message}). Veuillez rafraîchir la page.`);
    return false; // Allows the error to still show in the F12 console for developers
};

// Listen for connection crashes (Failed fetches, broken internet)
window.addEventListener('unhandledrejection', function(event) {
    showVisualError(`La connexion a échoué. Vérifiez votre internet ou réessayez plus tard.`);
});







// =====================================================================
// 1. DATA CONTAINERS (The "Buckets" and "Phonebooks")
// =====================================================================
// Think of '[]' as an empty bucket (list) and '{}' as an empty phonebook (dictionary).
// When the dashboard loads, it will pour data from the Forecast V4 and Suivi délai livraison Google Sheets into these containers.

// For example, PRODS will hold all products, RECEPTIONS will hold incoming orders.
// e.g., PRIX_MAP looks up a product's name and instantly gives you its unit cost.
// Removed ETAT, added TRANSFERTS, COUT_MAP, PRIX_ID_MAP, and ABC_ID_MAP (July 16th)
let PRODS=[],STOCKY=[],TRANSFERTS=[],RECEPTIONS=[],PREVISION=[],PROMOS=[],BUDGET=[],PRIX_MAP={},PRIX_ID_MAP={},COUT_MAP={},DELAIS_MAP={},FORECAST=[];
// Phonebook specifically to store custom notes/comments about specific products.
let COMMENTS_MAP={};

// Phonebook for last year's sales (Ventes N-1 in Forecast V4) using clean, standardized names.
let VN1_NORM={};

// A "Cleaning Tool" function. It takes messy text (like "Café-Liégeois!") and turns 
// it into clean, searchable text (like "cafe liegeois"). This stops the computer 
// from getting confused by typos, capital letters, or missing dashes.
function normKey(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();}
let FOURNISSEURS=[],ABC_MAP={},VN1_MAP={};



// =====================================================================
// 2. DASHBOARD MEMORY (The "Sticky Notes")
// =====================================================================
// These variables remember what the user is currently doing on the screen, 
// so the dashboard doesn't reset every time they click a button.

// PF = Promo Filter (remembers we are currently looking at 'all' promos)
// CV = Current View (remembers the app opens on the 'alertes' tab by default)
// SEL_BUDGET = Remembers if the user has clicked on a specific budget row (starts empty/null)
let PF='all', CV='alertes', SEL_BUDGET=null;


let PO_EXTRAS={}; 
let PO_CUSTOM={}; 
let PRIX_OVERRIDE={}; 
const PRIX_FALLBACK_ID={"39423037636697":19.83,"39423037669465":158.64,"39423036424281":22.32,"39423036457049":178.56,"39505906171993":4.61,"39505906204761":46.1,"39505894735961":4.03,"39505894768729":47.0,"39286587293785":1968.6,"39379097354329":2852.6,"31133707206745":3846.0,"31133856268377":1505.0,"31133862428761":1606.0,"39505894047833":4.61,"39505894080601":46.1,"32062701142105":8696.25,"40247089332313":15.0,"40247089365081":27.0,"43204120707161":90.0,"32098752987225":806.25,"32102521372761":1668.75,"32102714474585":1946.25,"32102741082201":1308.75,"42622009081945":795.0,"42622009114713":821.25,"32113311580249":22.0,"32113329209433":15.0,"40509087449177":5810.0,"42153932980313":5810.0,"42153933013081":6125.0,"32163205382233":7341.75,"32177744183385":723.75,"42409361932377":1931.25,"42409361899609":2096.25,"42409361997913":2096.25,"32239440527449":1.5,"39286643425369":1450.0,"32382263394393":430.0,"32382263427161":430.0,"32382263459929":430.0,"39751786692697":514.5,"40467509608537":430.0,"41543633502297":430.0,"41543634288729":430.0,"40106547052633":26.21,"40106547085401":67.46,"42151907557465":19.46,"42151907590233":52.46,"32331606130777":62.6,"43204146921561":20.21,"43204146954329":121.26,"32363213258841":32.0,"43269554864217":10.0,"43269554896985":60.0,"32363222597721":10.0,"39471519531097":10.23,"39471519563865":62.0,"40430742110297":62.0,"40430742143065":50.46,"39471498657881":10.23,"40142641954905":72.0,"40430750203993":61.38,"40430750236761":50.46,"32391986380889":74.25,"39286560686169":2026.0,"39286571565145":2096.0,"39286575890521":2036.6,"39288837144665":281.25,"39768828575833":9345.0,"39768828608601":12350.0,"39768828674137":12350.0,"39768830017625":8872.0,"39768830083161":9068.0,"39768830115929":9068.0,"40523997773913":10000.0,"39305219571801":142.4,"39531804754009":76.5,"39531804786777":79.5,"39531804819545":84.0,"39305235365977":24.75,"39305244639321":190.5,"39305477226585":910.0,"39312028958809":31.5,"39312071229529":55.99,"40398413037657":20.0,"39312179101785":3.0,"39312381378649":15.0,"39797854797913":28.44,"39797854830681":33.12,"39797854863449":37.53,"39349384052825":296.25,"39349384085593":296.25,"40246770499673":371.25,"40246770466905":371.25,"39349445328985":562.5,"39356774416473":936.0,"39372578816089":115.0,"40306923602009":5.0,"41736710946905":9.22,"42190923956313":9.0,"39778636267609":7.0,"39379730399321":74.25,"39390188109913":4646.25,"39399568408665":52.46,"39399569031257":33.71,"39399570047065":32.21,"39399570243673":32.21,"39399574274137":104.96,"39420458369113":40.5,"39424787185753":29.25,"39424818643033":106.5,"42270065262681":48.0,"42270065229913":48.0,"39434677190745":11.9,"39434702782553":34.94,"39436545163353":23.03,"39438869921881":31.5,"39438923890777":73.5,"39522756427865":52.49,"39522756460633":55.99,"42727921188953":32.0,"42727921221721":32.0,"42727921254489":35.0,"40257060438105":83.25,"40257060470873":83.25,"40083939033177":3896.25,"40083939000409":3746.25,"42371511976025":8246.25,"42371512008793":8696.25,"39522762981465":52.49,"39522763014233":55.99,"39522837725273":69.99,"39531815403609":69.0,"43207052755033":63.75,"43207052787801":382.5,"39531874615385":57.71,"39668678033497":840.0,"39548266217561":840.0,"42031468970073":890.0,"39550847058009":51.75,"39550847090777":51.75,"39550896537689":927.99,"39550924554329":3519.0,"43273461694553":385.6,"43273461727321":385.6,"42484376469593":1343.99,"41827384983641":1343.99,"41827384950873":1343.99,"41568712753241":1535.99,"39592982511705":1535.99,"42484372570201":1535.99,"40401995399257":635.0,"40408832639065":675.0,"40401995432025":635.0,"39624643543129":32.0,"39624653242457":114.0,"40561531289689":201.6,"42849037221977":198.0,"40561531322457":198.0,"42849037254745":198.0,"40391467958361":1100.0,"40391513210969":2184.0,"40391513243737":2184.0,"40516151476313":410.0,"40516151443545":410.0,"41037192265817":410.0,"41037192331353":410.0,"42030647541849":410.0,"41037192298585":410.0,"41037274447961":992.0,"41037274480729":992.0,"40516235001945":2310.0,"41037280018521":3009.3,"41037280084057":3009.3,"41037280116825":3009.3,"41037280149593":3009.3,"40516293001305":630.0,"40903080476761":724.0,"41037176242265":724.0,"40903080443993":724.0,"41037180174425":724.0,"41037176209497":724.0,"42892182519897":724.0,"40516308074585":744.0,"40516567367769":1499.99,"42260065779801":24.0,"42260065812569":33.0,"40516616388697":72.0,"40516626055257":15.0,"40516639260761":15.0};
let PO_ENVOYES={};
let MODIF_PO_LINES=[];
let MODIF_PO_CTX=null;


// SORTS is the memory for the table headers. It remembers which column is clicked 
// for every single tab. 'dir: 1' means sorting lowest-to-highest (A-Z). 'dir: -1' means highest-to-lowest.
// (e.g., 'a' = Alertes tab, 's' = Stocks tab, 'v' = Ventes tab).
// Add d:{col:'capital',dir:-1} to the end of this list
// Cleaned up SORTS: Removed 'e' (Etat des stocks), added 'b' (Budget) and kept 'd' (Dormant) (July 16th)
let SORTS={
  a:{col:'stock',dir:1},
  s:{col:'stock',dir:1},
  f:{col:'pareto',dir:1},
  v:{col:'vt',dir:-1},
  fc:{col:'nom',dir:1},
  pr:{col:'nom',dir:1},
  b:{col:'sn',dir:1},
  d:{col:'capital',dir:-1}
};
// Temporary buckets to hold the specific, filtered results for the Alertes and Stocks tables.
let PRODS_A=[],PRODS_S=[];

// A Phonebook linking a Supplier to a specific team member (e.g., matching a supplier to Nina or Clovis).
let VENDOR_MAP={};

// A sticky note that remembers which team member's button is currently clicked at the top of the screen.
let EQUIPE_FILTER='';













// ---------------------------------------------------------
// CORE UTILITIES
// ---------------------------------------------------------
// "mini-tool" to call its name whenever we need it
// The Data Cleaners, The Formatters, The Visual Decorators, and The Team Filters.

// Takes any messy text (like "Mahlkonig E80 - Black") and strips away all spaces, dashes, 
// and capital letters to create a perfect matchable key (mahlkonige80black).
function normalize(str) {
    return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function createKey(name, variant) {
    const cleanName = String(name || '').trim();
    const cleanVariant = String(variant || '').trim();
    const finalVariant = (cleanVariant.toLowerCase() === 'default title') ? '' : cleanVariant;
    return normalize(cleanName + " " + finalVariant);
}

// Checks the master phonebook (VENDOR_MAP) to see if a specific supplier
// belongs to the team member currently selected at the top of the screen.
function equipeMatch(fourn){
  if(!EQUIPE_FILTER)
    return true;
  const eq=(VENDOR_MAP[fourn]||'').toLowerCase();
  return eq.includes(EQUIPE_FILTER);
}

// When you click "Nina" or "Clovis", this function executes. It highlights the button you clicked, 
// filters the supplier dropdown menu to only show their specific vendors, and instantly refreshes the screen.
function setEquipe(eq,el){
  EQUIPE_FILTER=eq;
  document.querySelectorAll('.eq-btn').forEach(b=>b.classList.remove('on'));
  el.classList.add('on');
  const sf=document.getElementById('s-f');
  if(sf){
    const fournsFiltered=FOURNISSEURS.filter(f=>equipeMatch(f));
    sf.innerHTML='<option value="">Choisir un fournisseur…</option>'+fournsFiltered.map(f=>`<option>${f}</option>`).join('');
  }
  renderView(CV);
}

// When Google Sheets sends data to the app, it sends it as a giant, raw grid. 
// This tool reads the top row (the headers) and turns the rest of the grid into neat, organized data packages 
// the app can read. It also automatically throws away empty rows.
function pT(vals){
  if(!vals||vals.length<2)
    return[];
  const h=vals[0].map(x=>String(x||'').trim());
  return vals.slice(1).map(row=>{const o={};h.forEach((k,i)=>{o[k]=row[i]!==undefined?row[i]:'';});return o;})
    .filter(r=>Object.values(r).some(v=>String(v).trim()!==''));
}
// If a cell in Google Sheets says "$ 1,200.50 ", the computer sees a word, not a number. 
// This tool strips out the dollar signs, spaces, and commas, turning it into pure math (1200.5). 
// If a cell is blank, it safely outputs a 0 instead of crashing.
function n(v){
  if(v===''||v===null||v===undefined)
    return 0;
  const x = parseFloat(String(v).replace(/[$,\s]/g,''));
  return isNaN(x)?0:x;
}

  // Takes a raw number (like 1234.56) and rounds it to a clean, formatted whole number (like 1 235).
function fmt(v){
  return Math.round(n(v)).toLocaleString('fr-CA');
}

// Takes a raw number and turns it into Canadian currency formatting (e.g., 1 235 $).
function fmtM(v){
  return n(v).toLocaleString('fr-CA',{minimumFractionDigits:0,maximumFractionDigits:0})+' $';
}

// Computers read dates as giant ugly timestamps (e.g., 2026-06-25T04:00:00.000Z). 
// This tool chops that up and returns a clean, familiar date: 25/06/26.
function fmtD(iso){
  if(!iso||iso==='')
  return'—';
  try{let d;
    if(typeof iso==='string'&&iso.includes('T')){
    const p=iso.substring(0,10).split('-');
    d=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));}
  else{d=new Date(iso);}if(isNaN(d))
    return String(iso).substring(0,10);
  const dd=String(d.getDate()).padStart(2,'0');
  const mm=String(d.getMonth()+1).padStart(2,'0');
  const yy=String(d.getFullYear()).substring(2);
  return dd+'/'+mm+'/'+yy;}
  catch{
    return String(iso).substring(0,10);
  }
}

// It calculates exactly what week of the year we are currently in (from 1 to 52) so the dashboard always knows where to anchor its math.
function cw(){const d=new Date(),s=new Date(d.getFullYear(),0,1);
  return Math.ceil(((d-s)/86400000+s.getDay()+1)/7);
}

// Updates the text on the white loading screen while the app fetches data 
// (e.g., changing "Connexion à Google Sheets…" to "Parsing des données…").
function setMsg(m){document.getElementById('lmsg').textContent=m;
}

// Creates the little colored squares for your Pareto rankings (A, B, or C).
function bP(p){
  return`<span class="bx ${p==='A'?'ba':p==='B'?'bb':'bc'}">${p||'C'}</span>`;
}

// Status Badges: Reads the status of an item and paints a colored badge:
// Red for "Rupture" (Out of Stock), Orange for "Critique", and Green for "Actif".
function bS(s,sp){
  const sl=String(s||'').toLowerCase();
  if(sl.includes('rupture'))
    return`<span class="bx br2">Rupture</span>`;
  if(sl.includes('critique')||sl.includes('faible'))
    return`<span class="bx bam">Critique</span>`;
  return`<span class="bx bgr">Actif</span>`;
}

// It looks at the physical stock number. If the stock is negative, it tags it with red (sn). 
// If the stock is 5 or less, it tags it with orange (sl). Otherwise, it leaves it alone.
function sc(v){
  return v<0?'sn':v<=5?'sl':'';
}


function rForecast(){
  const srch=(document.getElementById('s-fc')?.value||'').toLowerCase();
  const fourns=gC('ffc'),pars=gC('pfc');
  let rowsFc=FORECAST.filter(r=>{
    if(!equipeMatch(r.fourn))return false;
    if(fourns.length&&!fourns.includes(r.fourn))return false;
    if(pars.length&&!pars.includes(r.cat))return false;
    if(srch&&!r.nom.toLowerCase().includes(srch))return false;
    return true;
  });
  const months=['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];
  rowsFc.forEach(r=>{const p=PRODS.find(x=>x.nom===r.nom);r.stock=p?p.stock:0;r._total=months.reduce((s,m)=>s+(r[m]||0),0);});
  const rows=sortProds(rowsFc,SORTS.fc.col,SORTS.fc.dir);
  document.getElementById('rc-fc').textContent=rows.length+' produit(s)';
  document.getElementById('tb-fc').innerHTML=rows.map(r=>{
    const total=months.reduce((s,m)=>s+(r[m]||0),0);
    const prod=PRODS.find(p=>p.nom===r.nom);
    const stockVal=prod?fmt(prod.stock):'—';
    const stockCls=prod?sc(prod.stock):'';
    const varHtml=prod&&prod.variante?'<div class="pv">'+prod.variante+'</div>':'';
    return '<tr><td><div class="pn">'+r.nom+'</div>'+varHtml+'</td><td style="color:var(--t2);font-size:12px">'+r.fourn+'</td><td>'+bP(r.cat)+'</td><td style="text-align:right"><span class="'+stockCls+'">'+stockVal+'</span></td>'+
      months.map(m=>{const v=r[m]||0;return v>0?'<td style="text-align:right;color:var(--gr);font-weight:500">'+fmt(v)+'</td>':'<td style="text-align:right;color:var(--t3)">—</td>';}).join('')+
      '<td style="text-align:right;font-weight:600">'+fmt(total)+'</td></tr>';
  }).join('')||'<tr><td colspan="17" style="text-align:center;padding:40px;color:var(--t3)">Aucun forecast</td></tr>';
}



// ---------------------------------------------------------
// DATA INGESTION ENGINE
// ---------------------------------------------------------
// This is the most important function in the app. It acts as the "Ignition Switch".
// The word "async" (asynchronous) tells the computer: "We have to wait for the 
// internet to download the data before we can build the tables."

async function loadData(){
  // 1. Turn on the white loading screen and show the first message
  document.getElementById('lov').style.display='flex';
  setMsg('Connexion à Google Sheets…');

  // Create a 60-second countdown timer (Optionnel)
  // const controller = new AbortController();
  // const timeoutId = setTimeout(() => controller.abort(), 60000); // 60000 milliseconds = 60 seconds

  try {
    // 2. THE FETCH: The app literally "calls" the Google Sheet URL and asks for the data.
    setMsg('Chargement des données en live. Attendez un instant...');
    const resp=await fetch(URL_AS);
    if(!resp.ok)throw new Error('Erreur réseau: '+resp.status);

    // If it succeeds before 60 seconds, we clear the timer so it doesn't trigger anyway
    // clearTimeout(timeoutId);

    // 3. THE TRANSLATION: The data arrives as a raw text string. 
    // '.json()' translates it into organized JavaScript buckets we can read.
    const rawArrays=await resp.json();
    const raw=rawArrays;
    window.raw = raw; // THIS MAKES IT ACCESSIBLE IN THE CONSOLE
    setMsg('Parsing des données…');



    // =================================================================
    // 3A. BUILDING THE MINI-PHONEBOOKS (Mappings)
    // =================================================================
    // Before building the massive product list, the app reads the smaller tabs 
    // to build quick-reference dictionaries. It uses `.slice(1)` to skip the header row.

    // Delivery Times (Delais de livraison)
    // Looks up a Supplier (Column 1) and tells you how many weeks they take to deliver (Column 2).
    DELAIS_MAP={};
    (raw['Delais de livraison']||[]).slice(1).forEach(r=>{ 
      const fourn=String(r[0]||'').trim(); 
      const delai=parseFloat(r[1]||0)||0; 
      if(fourn)DELAIS_MAP[fourn]=delai; });
    
    // Assignments (Tableau correspondance)
    // Looks up a Supplier (Column 1) and tells you which team member manages them (Column 2 - Nina/Clovis).
    VENDOR_MAP={};
    (raw['Tableau correspondance']||[]).slice(1).forEach(r=>{ 
      const fourn=String(r[0]||'').trim(); 
      const eq=String(r[1]||'').trim().toLowerCase(); 
      if(fourn)VENDOR_MAP[fourn]=eq; 
    });

    // Order Comments (Stocky Orders)
    // Looks up a Product Name (Column 1) and saves any special notes/comments about it (Column 11).
    COMMENTS_MAP={}; 
    (raw['Stocky Orders']||[]).slice(1).forEach(r=>{ 
      const nom=String(r[0]||'').trim(); 
      const com=String(r[10]||'').trim(); 
      if(nom&&com)COMMENTS_MAP[nom]=com; 
    });

    // Pareto Rankings (ABC)
    // Looks up a Product Name (Column 2) and saves its ranking category (A, B, or C from Column 8).
    ABC_MAP={};
    ABC_ID_MAP={};
    (raw['ABC']||[]).slice(1).forEach(r=>{ 
      const nom=String(r[1]||'').trim();
      const idAbc=String(r[4]||'').trim(); // colonne E = ID variante
      const pareto=String(r[7]||'C').trim();
      if(idAbc)ABC_ID_MAP[idAbc]=pareto;
      if(nom)ABC_MAP[nom]=pareto;
    });


    // =================================================================
    // 3B. BUILDING THE FINANCIAL & HISTORICAL PHONEBOOKS
    // =================================================================

    // 1. Capture Unit Cost (Prix produits Tab: Name in Col B [1], Cost in Col H [7])
    // Looks at Column B for the Product Name and Column H for the Cost.
    // If a product has a cost greater than $0, it saves it here so the Dormant 
    // Stock tab can calculate the trapped capital later.

    // The app does not assume every product has a cost. 
    // It specifically checks the "Prix produits" tab, grabs the dollar value, and links it to the product's name.
    // 1. Capture Unit Cost and Retail Price (Prix produits Tab)
    // 1. Capture Unit Cost and Retail Price (Prix produits Tab)
    PRIX_MAP={};
    PRIX_ID_MAP={};
    COUT_MAP={};
    
    // Search for the tab ignoring capital letters!
    const nomOngletPrix = Object.keys(raw).find(k => k.toLowerCase() === 'prix produits');
    
    // 🚀 FIX 1: We now actually use 'nomOngletPrix' so it doesn't crash on capital letters!
    (raw[nomOngletPrix] || []).slice(1).forEach(r => {
      const t = String(r[1]||'').trim();
      
      // Index 3 = Column D (ID Variante) - This is perfectly correct!
      const idPp = String(r[3]||'').replace(/\D/g, ''); 
      
      // 🚀 FIX 2: We separate Retail Price (Col G) and Cost (Col H)
      const retail = n(r[6]); // Column G (Prix détail)
      const cost = n(r[7]);   // Column H (Coût unitaire)

      if(idPp) {
          if(cost > 0) { 
              PRIX_ID_MAP[idPp] = cost; // For PO Budget Math
              COUT_MAP[idPp] = cost;    // For Dormant Stock Capital
          }
          if(retail > 0) { 
              PRIX_MAP[idPp] = retail;  // For Simulation Profit Math
          }
      }
      
      if(t) {
          if(cost > 0) { COUT_MAP[normKey(t)] = cost; }
          if(retail > 0) { PRIX_MAP[normKey(t)] = retail; }
      }
    });

    // Capture N-1 Sales (Historical) - NOW USING IDs!
    // Capture N-1 Sales (Historical) - 🚀 STRICT PURE ID LOGIC
    VN1_MAP = {};
    let VN1_MONTHLY_MAP = {}; 

    const vn1rows=raw['Ventes N-1']||[];
    const VN1_NORM={};
    const VN1_ID_MAP={};
    
    vn1rows.slice(1).forEach(r=>{
      const titre=String(r[0]||'').trim();   // Titre avec variants
      const produit=String(r[1]||'').trim(); // Titre du produit
      const id=String(r[3]||'').replace(/\D/g, '');      // ID variante (col D)
      if(!titre||titre.startsWith('Dernière')||titre.startsWith('Titre'))return;
      
      let total=0;
      let months = []; 
      for(let i=4;i<=15;i++){
        let m_val = n(r[i]||0);
        total+=m_val;
        months.push(m_val);
      }
      if(total===0)return;

      if(id){ VN1_ID_MAP[id]=(VN1_ID_MAP[id]||0)+total; VN1_MONTHLY_MAP[id]=months; }
      if(titre)VN1_MAP[titre]=(VN1_MAP[titre]||0)+total;
      if(produit&&produit!==titre)VN1_MAP[produit]=(VN1_MAP[produit]||0)+total;
      if(titre)VN1_NORM[normKey(titre)]=(VN1_NORM[normKey(titre)]||0)+total;
      if(produit)VN1_NORM[normKey(produit)]=(VN1_NORM[normKey(produit)]||0)+total;
    });

    // =================================================================
    // 3C. Automated Forecasts
    // =================================================================
  
    // Reads what we predict to sell for the next 12 months (M01 to M12).
    const fcMap={};
    pT(raw['Forecast automatisé']||[]).forEach(r=>{
      const p=String(r['Titre du produit avec variants']||r['Produit']||'').trim();
      const id=String(r['ID produit']||r['ID Produit']||'').trim();
      const val={M01:n(r.M01),M02:n(r.M02),M03:n(r.M03),M04:n(r.M04),M05:n(r.M05),
        M06:n(r.M06),M07:n(r.M07),M08:n(r.M08),M09:n(r.M09),M10:n(r.M10),M11:n(r.M11),M12:n(r.M12)};
      if(p)fcMap[p]=val;
      if(id)fcMap[id]=val;
    });

    // FORECAST BUCKET:
    // This takes the exact same prediction data but formats it specifically 
    // to draw the table in the "Forecast" tab of the dashboard.
    FORECAST=pT(raw['Forecast automatisé']||[]).filter(r=>r['Titre du produit avec variants']||r['Produit']).map(r=>{
      const nomF=String(r['Titre du produit avec variants']||r['Produit']||'').trim();
      const idF=String(r['ID produit']||r['ID Produit']||'').trim();
      return{
        nom:nomF,
        fourn:String(r['Fournisseur']||'').trim(),
      // Uses the ABC phonebook we built earlier to assign the Pareto ranking
        cat:ABC_ID_MAP[idF]||ABC_MAP[nomF]||String(r['Pareto']||r['Catégorie']||'').trim(),
        M01:n(r['M01']),M02:n(r['M02']),M03:n(r['M03']),M04:n(r['M04']),M05:n(r['M05']),M06:n(r['M06']),
        M07:n(r['M07']),M08:n(r['M08']),M09:n(r['M09']),M10:n(r['M10']),M11:n(r['M11']),M12:n(r['M12'])
      };
    });



// =================================================================
    // 3D. Current Sales & Inventory
    // =================================================================

    // -----------------------------------------------------------------
    // STEP 1: Process Current Year's Sales (Ventes N)
    // -----------------------------------------------------------------
    const CW = cw(); // Get the current week of the year (e.g., Week 15)
    const vMap = {}; // A temporary phonebook to store sales data before attaching it to inventory
    const vMapById={};   // indexé par ID variante (col D dans Ventes N)

    pT(raw['Ventes N']||[]).forEach(r=>{
      const p=String(r['Titre du produit avec variants']||r['Produit']||'').trim();
      const id=String(r['ID']||r['ID Variante']||r['Variante ID']||'').replace(/\D/g, '');
      if(!p||p.startsWith('Dernière'))return;
      let total=0,nz=0,curV=0;
      const sems={};
      for(let i=1;i<=53;i++){
        const k='S'+String(i).padStart(2,'0');
        const v=n(r[k]);sems[k]=v;total+=v;
        if(v>0)nz++;
        if(i===CW)curV=v;
      }
      const entry={total,moy:nz>0?Math.round(total/nz*10)/10:0,curV,sems,
        fourn:String(r['Fournisseur']||''),var_:String(r['Variante']||r['Variant']||'')};
      vMap[normKey(p)]=entry;
      if(id)vMapById[id]=entry;
    });

    // -----------------------------------------------------------------
    // STEP 2: Build the Master Inventory List (PRODS)
    // -----------------------------------------------------------------
    // This is the most important array in the app. Almost every tab uses `PRODS`.
    
    // Stock produits
    const sRows=raw['Stock produits']||[];
    const seen=new Set();
    PRODS=[];
    sRows.slice(1).forEach(r=>{
      const nom=String(r[1]||r[2]||'').trim().replace(/\s*\|\s*$/,'');
      if(!nom||nom==='Clé produit'||nom.startsWith('Dernière')||nom.startsWith('Actualisation'))return;
      const nb=String(r[2]||'').trim();
      const idVariante=String(r[4]||'').replace(/\D/g, '');
      const skuFourn=String(r[6]||'').trim(); // colonne G = SKU fournisseur
      const key=nom+'|'+idVariante;
      if(seen.has(key))return;seen.add(key);
      const stock=n(r[7]);
      const statR=String(r[9]||'').toLowerCase().trim();
      if(statR==='draft'||statR==='archived')return; 
      const fourn=String(r[8]||'').trim();
      const variante=String(r[3]||'').trim();
      const en_cmd=n(r[13]||0);
      const pc=String(r[15]||'').trim();
      const pareto=(['A','B','C'].includes(pc)?pc:(ABC_ID_MAP[idVariante]||ABC_MAP[nb]||ABC_MAP[nom]||'C'));
      const fc=fcMap[nb]||fcMap[nom]||{};
      const vd=vMapById[idVariante]||vMap[normKey(nb)]||vMap[normKey(nom)]||{};
      const moisLabels=['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];
      const moisCourantKey=moisLabels[new Date().getMonth()];
      const fc_cur=fc[moisCourantKey]||0;
      const wkfc=fc_cur>0?fc_cur/4.33:(vd.moy||0);
      const wks_left=wkfc>0?Math.round(stock/wkfc):null;
      const statut_produit=statR||'active';
      const delai_fourn=DELAIS_MAP[fourn]||0;
      const semCourante=CW;

      // Demande cumulée sur délai fournisseur (min 1 sem), forecast sinon ventes moyennes
      let demandeCumulee=0;
      for(let s=0;s<Math.max(delai_fourn,1);s++){
        const sem=semCourante+s;
        const moisIdx=Math.min(11,Math.floor(((sem-1)/52.18)*12));
        const moisKey=moisLabels[moisIdx];
        const fcMois=fc[moisKey]||0;
        demandeCumulee+=fcMois>0?fcMois/4.33:0;      
      }
      
      let statut;
      if(stock<0) statut='rupture';
      else if((stock+en_cmd)<demandeCumulee&&demandeCumulee>0) statut='critique';
      else statut='active';

      const _r0=String(r[0]||'').trim().replace(/\s*\|\s*$/,'');
      const vn1=VN1_ID_MAP[idVariante]||VN1_MAP[nb]||VN1_MAP[nom]||VN1_MAP[_r0]||VN1_NORM[normKey(nb)]||VN1_NORM[normKey(nom)]||VN1_NORM[normKey(_r0)]||0;
      
      // ==========================================
      // 🚀 DORMANT STOCK INJECTION: Variable Attach
      // ==========================================
      const cout_unitaire = COUT_MAP[idVariante] || COUT_MAP[normKey(nom)] || COUT_MAP[normKey(nb)] || 0;
      const vn1_months_array = VN1_MONTHLY_MAP[idVariante] || [0,0,0,0,0,0,0,0,0,0,0,0];

      PRODS.push({nom,nb,variante:variante==='Default Title'?'':variante,fourn,statut,statut_produit,stock,pareto,
      en_cmd,fc_m05:fc_cur,wks_left,demande_cumulee:demandeCumulee,vt:vd.total||0,vm:vd.moy||0,vc:vd.curV||0,sems:vd.sems||{},vn1,idVariante,skuFourn,
      cout: cout_unitaire, id: idVariante, vn1_months: vn1_months_array});
    });

    // Stocky Orders
    const byCmd={};
    (raw['Stocky Orders']||[]).slice(1).forEach(r=>{
      const cmd=String(r[5]||'').trim();
      const nomComplet=String(r[1]||'').trim(); 
      if(!cmd||!nomComplet||cmd.startsWith('Dernière')||cmd.startsWith('Actualisation'))return;
      if(!byCmd[cmd])byCmd[cmd]={cmd,fourn:String(r[4]||'').trim(),
        livraison:fmtD(r[7]||''),date_cmd:'',lignes:[],total:0};
      const qty=n(r[6]||1);
      const nouvelleDate=String(r[9]||'').trim();
      const com=nouvelleDate?fmtD(nouvelleDate):'';
      byCmd[cmd].lignes.push({nom:nomComplet,variante:String(r[3]||''),qty,livraison:fmtD(r[7]||''),com});
      byCmd[cmd].total+=qty;
    });
    STOCKY=Object.values(byCmd).filter(c=>c.lignes.length>0).sort((a,b)=>b.cmd-a.cmd);

    // Transferts
    const byCmdT={};
    (raw['Transferts']||[]).slice(1).forEach(r=>{
      const cmd=String(r[5]||'').trim();
      const nomComplet=String(r[1]||'').trim();
      if(!cmd||!nomComplet)return;
      if(!byCmdT[cmd])byCmdT[cmd]={cmd,fourn:String(r[4]||'').trim(),
      livraison:fmtD(String(r[7]||'').trim())||'—',date_cmd:'',lignes:[],total:0};      
      const qty=n(r[6]||0);
      const nouvelleDateT=String(r[9]||'').trim();
      const comT=nouvelleDateT?fmtD(nouvelleDateT):'';
      byCmdT[cmd].lignes.push({nom:nomComplet,titre:String(r[2]||'').trim(),variante:String(r[3]||''),sku:String(r[8]||'').trim(),qty,livraison:byCmdT[cmd].livraison,com:comT});      
      byCmdT[cmd].total+=qty;
    });
    TRANSFERTS=Object.values(byCmdT).filter(c=>c.lignes.length>0).sort((a,b)=>b.cmd.localeCompare(a.cmd));

    // Reconstruction de PO_ENVOYES 
    {
      const combinedNomToId={}, skuToId={};
      PRODS.forEach(p=>{
        const combine = p.variante ? p.nom+' - '+p.variante : p.nom;
        combinedNomToId[normKey(combine)]=p.idVariante;
        if(p.skuFourn)skuToId[normKey(p.skuFourn)]=p.idVariante;
      });
      const poEnvoyesReconstruit={};
      TRANSFERTS.forEach(c=>{
        if(!c.fourn)return;
        const lignesResolues=c.lignes.filter(l=>l.qty>0).map(l=>{
          const idV = combinedNomToId[normKey(l.nom)] || skuToId[normKey(l.sku)] || '';
          return {idVariante:idV, quantite:l.qty, nom:l.titre||l.nom, variante:l.variante||'', sku:l.sku||''};
        });
        if(!lignesResolues.length)return;
        if(!poEnvoyesReconstruit[c.fourn])poEnvoyesReconstruit[c.fourn]=[];
        poEnvoyesReconstruit[c.fourn].push({poNumber:c.cmd,lignes:lignesResolues,date:''});
      });
      Object.keys(poEnvoyesReconstruit).forEach(f=>{
        const poNumsReconstruits=new Set(poEnvoyesReconstruit[f].map(e=>e.poNumber));
        const enMemoireNonEncoreDansSheet=(PO_ENVOYES[f]||[]).filter(e=>!poNumsReconstruits.has(e.poNumber));
        PO_ENVOYES[f]=[...poEnvoyesReconstruit[f],...enMemoireNonEncoreDansSheet];
      });
    }

    // Réceptions par semaine
    RECEPTIONS=pT(raw['Réception des commandes']||[]).filter(r=>{
      const nom=String(r['Nom produit']||'').trim();
      if(!nom||nom.startsWith('Dernière'))return false;
      for(let i=CW-1;i<=52;i++){if(n(r['Semaine '+i])>0)return true;}
      return false;
    }).map(r=>{
      const nom=String(r['Nom produit']||'').trim();
      const idRecep=String(r['ID']||r['ID Variante']||r['Id produit']||'').trim();
      const sems={};for(let i=1;i<=52;i++)sems[i]=n(r['Semaine '+i]);
      return{nom,fourn:String(r['Fournisseur']||''),cat:ABC_ID_MAP[idRecep]||ABC_MAP[nom]||String(r['Catégorie']||'C'),sems};
    });

    // Prévision commandes 
    PREVISION=pT(raw['Prevision commandes']||[]).filter(r=>{
      const nom=String(r['Nom produit']||'').trim();
      return nom&&!nom.startsWith('Dernière');
    }).map(r=>{
      const nom=String(r['Nom produit']||'').trim();
      const sems={};for(let i=1;i<=52;i++)sems[i]=n(r['Semaine '+i]);
      const pMatch=PRODS.find(x=>x.nom===nom);
      const idPrev=pMatch?pMatch.idVariante:'';
      const vdp=vMap[normKey(nom)]||(idPrev?(vMapById[idPrev]||{}):{})||{};
      
      const coutParId = idPrev ? (COUT_MAP[idPrev] || 0) : 0;
      const coutParNom = COUT_MAP[normKey(nom)] || (pMatch ? COUT_MAP[normKey(pMatch.nb)] || 0 : 0) || 0;
      const coutFinal = coutParId > 0 ? coutParId : (coutParNom > 0 ? coutParNom : (idPrev ? (PRIX_FALLBACK_ID[idPrev] || 0) : 0));
      
      return{nom,fourn:String(r['Fournisseur']||''),cat:(idPrev&&ABC_ID_MAP[idPrev])||ABC_MAP[nom]||String(r['Catégorie']||'C'),
        delai:n(r['Délai livraison']),
        tc:n(r['TOTAL commandes']),tf:n(r['Total forecast']),ts:n(r['Total stock']),
        prix:coutFinal,vm:vdp.moy||0,sems,idVariante:idPrev};
    });
    PREVISION=PREVISION.concat(pT(raw['Prevision commandes - Clovis']||[]).filter(r=>{
      const nom=String(r['Nom produit']||'').trim();
      return nom&&!nom.startsWith('Dernière');
    }).map(r=>{
      const nom=String(r['Nom produit']||'').trim();
      const sems={};for(let i=1;i<=52;i++)sems[i]=n(r['Semaine '+i]);
      const pMatch=PRODS.find(x=>x.nom===nom);
      const idPrev=pMatch?pMatch.idVariante:'';
      const vdp=vMap[normKey(nom)]||(idPrev?(vMapById[idPrev]||{}):{})||{};
      
      const coutParId = idPrev ? (COUT_MAP[idPrev] || 0) : 0;
      const coutParNom = COUT_MAP[normKey(nom)] || (pMatch ? COUT_MAP[normKey(pMatch.nb)] || 0 : 0) || 0;
      const coutFinal = coutParId > 0 ? coutParId : (coutParNom > 0 ? coutParNom : (idPrev ? (PRIX_FALLBACK_ID[idPrev] || 0) : 0));
      
      return{nom,fourn:String(r['Fournisseur']||''),cat:(idPrev&&ABC_ID_MAP[idPrev])||ABC_MAP[nom]||String(r['Catégorie']||'C'),
        delai:n(r['Délai livraison']),
        tc:n(r['TOTAL commandes']),tf:n(r['Total forecast']),ts:n(r['Total stock']),
        prix:coutFinal,vm:vdp.moy||0,sems,idVariante:idPrev};
    }));

    // Promos
    PROMOS=pT(raw['Promos']||[]).filter(r=>r['Produit']&&(r['Date Début']||r['Date Fin'])).map(r=>{
      const boost=n(String(r['Boost%']||'0').replace('%',''));
      const prixPromo=n(r['Prix promo']||r['Prix Promo']||r['Prix régulier promo']||0);
      const variante=String(r['Variante Shopify']||'').trim();
      return{produit:String(r['Produit']||''),marque:String(r['Marque']||''),
        dd:fmtD(r['Date Début']),df:fmtD(r['Date Fin']),
        sd:n(r['Sem. Début (ISO)']),sf:n(r['Sem. Fin (ISO)']),
        boost,prixPromo,variante};
    });

    // Budget 
    BUDGET=[];
    for(let i=1;i<=52;i++){
      const val=PREVISION.reduce((s,r)=>equipeMatch(r.fourn)?s+(r.sems[i]||0)*(r.prix||0):s,0);
      BUDGET.push({label:'Semaine '+i,val:Math.round(val),sn:i});
    }

    FOURNISSEURS=[...new Set(PRODS.map(p=>p.fourn).filter(Boolean))].sort();

    const W=cw();
    document.getElementById('tinfo').textContent=`Google Sheets · Live · S${W} · ${new Date().toLocaleDateString('fr-CA')}`;
    document.getElementById('tupd').textContent='MAJ '+new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('nb-r').textContent=(STOCKY.filter(c=>!c.recu).length+TRANSFERTS.length)||'';
    const crit=PRODS.filter(p=>p.statut==='critique').length;
    document.getElementById('nb-p').textContent=PROMOS.filter(p=>p.sd<=W&&p.sf>=W).length||'';

    populateFiltres();
    // Update forecast column headers with current month
    const moisNoms=['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];
    const moisCourantLabel=moisNoms[new Date().getMonth()];
    document.querySelectorAll('[id^="th-fc"]').forEach(el=>el.textContent='Forecast '+moisCourantLabel);
    document.getElementById('lov').style.display='none';
    renderView(CV);
  }catch(e){setMsg('❌ Erreur : '+e.message);console.error(e);}
}









// ---------------------------------------------------------
// UI ROUTING & RENDERING (Base Dashboard)
// ---------------------------------------------------------

// This section takes all the clean data we just organized and paints it 
// onto the user's screen. It also listens for clicks on buttons and filters.

// -----------------------------------------------------------------
// A. THE FILTER BUILDERS
// -----------------------------------------------------------------
// These functions automatically generate the Dropdown Menus in the UI. 
// Instead of hardcoding 100 suppliers into the HTML file, the app reads 
// the active data and builds the dropdowns dynamically.
function populateFiltresFc(){
  const ff=document.getElementById('f-fc');
  if(!ff||ff.options.length>1)
    return;
  // Look at the Forecast data, grab all unique suppliers, and sort them A-Z
  const fourns=[...new Set(FORECAST.map(r=>r.fourn).filter(Boolean))].sort();
  // Create an HTML <option> tag for every single supplier and insert it into the dropdown
  fourns.forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=f;ff.appendChild(o);
  });
}

function populateFiltres(){
  // Build the master Supplier Dropdown list
  const opts='<option value="">Tous fournisseurs</option>'+FOURNISSEURS.map(f=>`<option>${f}</option>`).join('');

  // Inject this identical dropdown list into five different tabs at once
  // (Alertes, Stocks, Ventes, Etat, Receptions)
  ['f-a','f-s','f-v','f-e','f-r'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=opts;});

  // Apply team-specific filters (Nina vs Clovis) to the main screen
  const sf=document.getElementById('s-f');
  const fournsFiltered=FOURNISSEURS.filter(f=>equipeMatch(f));
  if(sf)sf.innerHTML='<option value="">Choisir un fournisseur…</option>'+fournsFiltered.map(f=>`<option>${f}</option>`).join('');

  // Build the "Week Selection" Dropdowns (e.g., S24, S25, S26)
  const W=cw();
  const swOpts=[];

  // Generate options from 4 weeks ago, up to 12 weeks in the future
  for(let i=Math.max(1,W-4);i<=Math.min(52,W+12);i++)
    swOpts.push(`<option value="${i}"${i===W?' selected':''}>S${String(i).padStart(2,'0')}${i===W?' (courante)':''}</option>`);

  const swr=document.getElementById('sw-r');
  if(swr)swr.innerHTML='<option value="">Toutes semaines</option>'+swOpts.join('');

  const ddlSwpo = document.getElementById('ddl-swpo');
  if(ddlSwpo && !ddlSwpo.childElementCount){
    ddlSwpo.innerHTML = (() => {
      const arr = [];
      for(let i = Math.max(1, W - 4); i <= Math.min(52, W + 16); i++) arr.push(i);
      return arr;
    })().map(i => `<label class="dd-item"><input type="checkbox" name="swpo" value="${i}"${i===W?' checked':''} onchange="updDD('dd-swpo','swpo');rPO()"> S${String(i).padStart(2,'0')}${i===W?' (courante)':''}</label>`).join('');
    updDD('dd-swpo','swpo');
  }

  const swpr=document.getElementById('sw-pr');
  if(swpr)swpr.innerHTML='<option value="">Toutes semaines</option>'+swOpts.join('');

  // Build the specific PO filter
  const fpo=document.getElementById('f-po');
  if(fpo){
    const W2=cw();
    const pf=[...new Set(PREVISION.filter(r=>r.sems[W2]>0).map(r=>r.fourn).filter(Boolean))].sort();
    fpo.innerHTML='<option value="">Tous fournisseurs actifs S'+String(W2).padStart(2,'0')+'</option>'+pf.map(f=>`<option>${f}</option>`).join('');
  }

  // Build Promo filter
  const fpr=document.getElementById('f-pr');
  if(fpr){const mb=[...new Set(PROMOS.map(p=>p.marque).filter(Boolean))].sort();
fpr.innerHTML='<option value="">Toutes marques</option>'+mb.map(m=>`<option>${m}</option>`).join('');}

  // Call the function that builds the multi-select checkboxes
  populateFournDD();
}


// -----------------------------------------------------------------
// B. THE TRAFFIC COPS (Navigation & Sorting)
// -----------------------------------------------------------------
// The single-page app doesn't actually load new web pages. It just hides 
// one block of HTML and reveals another. This function acts as the traffic cop.

function nav(v,el){
  // 1. Turn "off" all the sidebar buttons
  document.querySelectorAll('.ni').forEach(e=>e.classList.remove('on'));

  // 2. Turn "on" the button the user just clicked
  el.classList.add('on');
  
  // 3. Hide all the main content screens
  document.querySelectorAll('.view').forEach(e=>e.classList.remove('on'));

  // 4. Reveal the specific screen the user asked for (e.g., v-alertes)
  document.getElementById('v-'+v).classList.add('on');

  // Remember what tab we are currently on, and paint its specific data table
  CV=v;
  renderView(v);
}


// A master switchboard. Depending on which tab is open, run the correct "paintbrush" function.
function renderView(v){
  if(v==='alertes')rAlertes();
  else if(v==='stocks')rStocks();
  else if(v==='fournisseurs')rFourn();
  else if(v==='ventes')rVentes();
  else if(v==='receptions')rReceptions();
  else if(v==='po')rPO();
  else if(v==='budget')rBudget();
  else if(v==='promos')rPromos();
  else if(v==='forecast')rForecast();
  else if(v==='dormant')rDormant();
}

function srt(tbl,col,el){
  const s=SORTS[tbl];
  // ADD d:'dormant' to the end of this map:
  const viewMap={a:'alertes',s:'stocks',f:'fournisseurs',v:'ventes',fc:'forecast',pr:'promos', d:'dormant'};  
  const scope=tbl==='f'?document.getElementById('fc'):document.getElementById('v-'+(viewMap[tbl]||tbl));
  scope?.querySelectorAll('th').forEach(t=>{t.classList.remove('asc','desc');});
  if(s.col===col)s.dir*=-1;else{s.col=col;s.dir=1;}
  el.classList.add(s.dir===1?'asc':'desc');
  
  // ADD  else if(tbl==='d')rDormant();  to the end of this line:
  if(tbl==='a') rAlertes();
  else if(tbl==='s')rStocks();
  else if(tbl==='f')rFourn();
  else if(tbl==='v')rVentes();
  else if(tbl==='fc')rForecast();
  else if(tbl==='pr')rPromos();
  else if(tbl==='b')rBudget();
  else if(tbl==='d')rDormant();
}


// The actual sorting logic behind the scenes.
function sortProds(arr,col,dir){
  return [...arr].sort((a,b)=>{
    let va=a[col],vb=b[col];

    // Special rule: Ensure Pareto sorts correctly (A is better than B, B is better than C)
    if(col==='pareto'||col==='cat'){const o={A:0,B:1,C:2};va=o[va]??3;vb=o[vb]??3;}
    else if(typeof va==='string')va=va.toLowerCase(),vb=vb.toLowerCase();
    return va<vb?-dir:va>vb?dir:0;
  });
}


// -----------------------------------------------------------------
// C. THE PAINTBRUSHES (Table Renderers)
// -----------------------------------------------------------------
// These functions take the data, apply the current filters, and generate 
// the raw HTML needed to draw the tables on the screen.

// 1. ALERTES TAB
function rAlertes(){
  // Grab the values currently selected by the user in the filters
  const srch=(document.getElementById('s-a')?.value||'').toLowerCase();
  const fourns=gC('fa'),pars=gC('pa'),stats=gC('sta');

  // FILTERING THE DATA: Iterate through every product and run it through a gauntlet of tests.
  let rows=PRODS.filter(p=>{
    const isR=p.statut==='rupture',isC=p.statut==='critique';

    // Strict requirement: Only show items that are Out of Stock or Critical
    if(!isR&&!isC)
      return false;

    // Strict requirement: Don't flag active items as critical if nobody wants to buy them
    if(p.statut!=='rupture'&&p.demande_cumulee<=0)
      return false;    

    // Team check (Nina vs Clovis)
    if(!equipeMatch(p.fourn))
      return false;

    // Dropdown/Checkbox checks
    if(fourns.length&&!fourns.includes(p.fourn))
      return false;
    if(pars.length&&!pars.includes(p.pareto))
      return false;
    if(stats.length&&!stats.includes(p.statut))
      return false;

    // Search bar check
    if(srch&&!p.nom.toLowerCase().includes(srch))
      return false;
    // If it survives the gauntlet, keep it!
    return true; 
  });


  // Sort the surviving rows
  rows=sortProds(rows,SORTS.a.col,SORTS.a.dir);
  PRODS_A=rows; // Save the result in the memory sticky note


  // CALCULATE KPIs: Generate the numbers for the colorful summary boxes at the top
  const ruptures=PRODS.filter(p=>p.statut==='rupture'&&p.demande_cumulee>0&&equipeMatch(p.fourn)).length;
  const crit=PRODS.filter(p=>p.statut==='critique'&&p.demande_cumulee>0&&equipeMatch(p.fourn)).length;
  const actifs=PRODS.filter(p=>p.statut_produit==='active'&&equipeMatch(p.fourn)).length;
  const pa=PRODS.filter(p=>(p.statut==='rupture'||p.statut==='critique')&&p.pareto==='A'&&p.demande_cumulee>0&&equipeMatch(p.fourn)).length;

  // Inject the KPI boxes into the HTML
  document.getElementById('mg-a').innerHTML=`
    <div class="mc" onclick="clearDD('dd-sta','sta',null);clearDD('dd-pa','pa',null);clearDD('dd-fa','fa',null);rAlertes()"><div class="mcl">Produits actifs</div><div class="mcv">${fmt(actifs)}</div><div class="mcs">Tout réinitialiser</div></div>
    <div class="mc" onclick="clearDD('dd-pa','pa',null);clearDD('dd-fa','fa',null);sC('sta',['rupture']);updDD('dd-sta','sta');rAlertes()"><div class="mcl">Ruptures (stock=0)</div><div class="mcv r">${fmt(ruptures)}</div><div class="mcs">↗ Cliquer pour voir</div></div>
    <div class="mc" onclick="clearDD('dd-pa','pa',null);clearDD('dd-fa','fa',null);sC('sta',['critique']);updDD('dd-sta','sta');rAlertes()"><div class="mcl">Critique</div><div class="mcv a">${fmt(crit)}</div><div class="mcs">↗ Cliquer pour voir</div></div>
    <div class="mc" onclick="clearDD('dd-sta','sta',null);clearDD('dd-fa','fa',null);sC('pa',['A']);updDD('dd-pa','pa');rAlertes()"><div class="mcl">Alertes Pareto A</div><div class="mcv b">${fmt(pa)}</div><div class="mcs">↗ Cliquer pour voir</div></div>
    <div class="mc" onclick="nav('receptions',document.querySelectorAll('.ni')[6])"><div class="mcl">Réceptions en cours</div><div class="mcv g">${fmt(STOCKY.length)}</div><div class="mcs">↗ Voir les commandes</div></div>`;
  
  document.getElementById('nb-a').textContent=rows.length||'';
  document.getElementById('rc-a').textContent=rows.length+' produit(s)';

  // DRAW THE TABLE: Generate the HTML for every single row and insert it into the page
  document.getElementById('tb-a').innerHTML=rows.map(p=>`<tr>
    <td><div class="pn">${p.nom}</div>${p.variante?`<div class="pv">${p.variante}</div>`:''}</td>
    <td style="white-space:nowrap;font-size:12px">${p.fourn||'—'}</td>
    <td>${bP(p.pareto)}</td>
    <td style="text-align:right"><span class="${sc(p.stock)}">${fmt(p.stock)}</span></td>
    <td>${bS(p.statut,p.statut_produit)}</td>
    <td style="text-align:right;font-size:12px">${p.wks_left!==null?p.wks_left+' sem.':'—'}</td>
    <td style="text-align:right">${p.en_cmd>0?fmt(p.en_cmd):'—'}</td>
    <td style="text-align:right">${fmt(p.fc_m05)}</td>
    <td style="text-align:right;font-weight:500;color:${p.statut==='rupture'?'var(--re)':p.statut==='critique'?'var(--am)':'var(--gr)'}">${fmt(p.stock+p.en_cmd)}</td>
  </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--t3)">Aucune alerte 🎉</td></tr>';
}

// 2. STOCKS TAB
function rStocks(){
  const srch=(document.getElementById('s-s')?.value||'').toLowerCase();
  const fourns=gC('fs'),pars=gC('ps'),stats=gC('sts');

  // Similar to the Alertes tab, but allows active/healthy items to pass through
  let rows=PRODS.filter(p=>{
    if(!equipeMatch(p.fourn))
      return false;
    if(fourns.length&&!fourns.includes(p.fourn))
      return false;
    if(pars.length&&!pars.includes(p.pareto))
      return false;
    if(stats.length&&!stats.includes(p.statut))
      return false;
    if(srch&&!p.nom.toLowerCase().includes(srch))
      return false;
    return true;
  });

  rows=sortProds(rows,SORTS.s.col,SORTS.s.dir);
  document.getElementById('rc-s').textContent=rows.length+' produit(s)';

  document.getElementById('tb-s').innerHTML=rows.map(p=>`<tr>
    <td><div class="pn">${p.nom}</div>${p.variante?`<div class="pv">${p.variante}</div>`:''}</td>
    <td style="white-space:nowrap;font-size:12px">${p.fourn||'—'}</td>
    <td>${bP(p.pareto)}</td>
    <td style="text-align:right"><span class="${sc(p.stock)}">${fmt(p.stock)}</span></td>
    <td>${bS(p.statut,p.statut_produit)}</td>
    <td style="text-align:right;font-size:12px">${p.wks_left!==null?p.wks_left+' sem.':'—'}</td>
    <td style="text-align:right">${p.en_cmd>0?fmt(p.en_cmd):'—'}</td>
    <td style="text-align:right">${fmt(p.fc_m05)}</td>
    <td style="text-align:right;font-weight:500;color:${p.statut==='rupture'?'var(--re)':p.statut==='critique'?'var(--am)':'var(--gr)'}">${fmt(p.stock+p.en_cmd)}</td>
  </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--t3)">Aucun résultat</td></tr>';
}

// This function zooms in on a single supplier to evaluate their specific 
// inventory health, out-of-stock items, and upcoming forecasts.
function rFourn(){
  // 1. Fetch what the user currently has selected
  const sel=document.getElementById('s-f')?.value||''; // Which supplier is chosen in the dropdown?
  const pars=gC('pf'), stats=gC('stf');                // Which Pareto/Status checkboxes are ticked?
  const fc=document.getElementById('fc');              // The blank canvas where we will draw the table
  
  // 2. THE GATEKEEPER
  // If the user hasn't selected a supplier yet, don't draw an empty table. 
  // Just show a polite message asking them to pick one.
  if(!sel){
      fc.innerHTML='<p style="color:var(--t3);padding:20px">Sélectionnez un fournisseur</p>';
      return;
  }
  
  // 3. THE ISOLATION
  // Search the massive master inventory list and pull out ONLY the products 
  // that belong to the chosen supplier.
  const allRows=PRODS.filter(p=>p.fourn===sel);
  
  // 4. THE FILTER GAUNTLET
  // Take that supplier's products and apply any checkbox filters the user clicked
  const rows=allRows.filter(p=>{
    if(pars.length && !pars.includes(p.pareto)) return false; // Filter by A/B/C
    if(stats.length && !stats.includes(p.statut)) return false; // Filter by Health Status
    return true; // Keep the product if it passes the tests
  });

  // Sort the final list based on the user's clicked column header (default is Pareto)
  const sorted=sortProds(rows,SORTS.f.col,SORTS.f.dir);
  
  // 5. CALCULATE SUPPLIER KPIs
  // Count exactly how many of this supplier's items are dead, dying, or healthy.
  const rupt=allRows.filter(p=>p.statut==='rupture');
  const crit=allRows.filter(p=>p.statut==='critique');
  
  // 6. DRAW THE UI
  // Generate the colorful boxes at the top, and the detailed table underneath
  fc.innerHTML=`
    <div class="mg">
      <div class="mc" onclick="clearDD('dd-stf','stf',rFourn)"><div class="mcl">Total produits</div><div class="mcv">${allRows.length}</div><div class="mcs">Tout afficher</div></div>
      <div class="mc" onclick="sC('stf',['rupture']);updDD('dd-stf','stf');rFourn()"><div class="mcl">Ruptures</div><div class="mcv r">${rupt.length}</div><div class="mcs">↗ Filtrer</div></div>
      <div class="mc" onclick="sC('stf',['critique']);updDD('dd-stf','stf');rFourn()"><div class="mcl">Critique</div><div class="mcv a">${crit.length}</div><div class="mcs">↗ Filtrer</div></div>
      <div class="mc" onclick="sC('stf',['active']);updDD('dd-stf','stf');rFourn()"><div class="mcl">OK</div><div class="mcv g">${allRows.length-rupt.length-crit.length}</div><div class="mcs">↗ Filtrer</div></div>
    </div>
    
    <div class="tw"><table>
      <thead>
        <tr>
            <th onclick="srt('f','nom',this)">Produit</th>
            <th onclick="srt('f','pareto',this)" class="asc">Pareto</th>
            <th style="text-align:right" onclick="srt('f','stock',this)">Stock</th>
            <th onclick="srt('f','statut',this)">Statut</th>
            <th style="text-align:right" onclick="srt('f','en_cmd',this)">En commande</th>
            <th style="text-align:right" onclick="srt('f','fc_m05',this)">Forecast M05</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(p=>`<tr>
            <td><div class="pn">${p.nom}</div>${p.variante?`<div class="pv">${p.variante}</div>`:''}</td>
            <td>${bP(p.pareto)}</td>
            <td style="text-align:right"><span class="${sc(p.stock)}">${fmt(p.stock)}</span></td>
            <td>${bS(p.statut,p.statut_produit)}</td>
            <td style="text-align:right">${p.en_cmd>0?fmt(p.en_cmd):'—'}</td>
            <td style="text-align:right">${fmt(p.fc_m05)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

// 3. VENTES TAB (Sales Velocity)
function rVentes(){
  const W=cw();
  const srch=(document.getElementById('s-v')?.value||'').toLowerCase();
  const fourns=gC('fv'),pars=gC('pv');

  // Filter out any product that has literally 0 sales in both the current and previous year
  const rowsFiltered=PRODS.filter(p=>{
    if(!equipeMatch(p.fourn))
      return false;
    if(fourns.length&&!fourns.includes(p.fourn))
      return false;
    if(pars.length&&!pars.includes(p.pareto))
      return false;
    if(srch&&!p.nom.toLowerCase().includes(srch))
      return false;
    return p.vt>0||p.vn1>0; // <--- The Sales strict check
  });

  const rows=sortProds(rowsFiltered,SORTS.v.col,SORTS.v.dir);
  document.getElementById('rc-v').textContent=rows.length+' produit(s)';

  // Build dynamic column headers to show the exact names of the last 5 weeks
  const dispWks=[];
  for(let i=Math.max(1,W-5);i<=W;i++)dispWks.push('S'+String(i).padStart(2,'0'));
  document.getElementById('th-v').innerHTML=`<tr>
    <th onclick="srt('v','nom',this)">Produit</th><th onclick="srt('v','fourn',this)">Fournisseur</th><th onclick="srt('v','pareto',this)">Pareto</th>
    ${dispWks.map(k=>`<th style="text-align:right">${k}</th>`).join('')}
    <th style="text-align:right" onclick="srt('v','vt',this)">Total N</th>
    <th style="text-align:right" onclick="srt('v','vn1',this)">Total N-1</th>
    <th style="text-align:right">Croissance</th>
    <th style="text-align:right" onclick="srt('v','vm',this)">Moy./sem.</th>
  </tr>`;
  document.getElementById('tb-v').innerHTML=rows.map(p=>{
    let growHtml='—';

    // Calculate Year-Over-Year Growth Percentage
    if(p.vn1>0){
      const n1ytd=Math.round(p.vn1*(W/52));
      if(n1ytd>0){
        const pct=Math.round((p.vt-n1ytd)/n1ytd*100);
        growHtml=`<span class="${pct>=0?'gpos':'gneg'}">${pct>=0?'+':''}${pct}%</span>`;
      }
    }
    return`<tr>
      <td><div class="pn">${p.nom}</div>${p.variante?`<div class="pv">${p.variante}</div>`:''}</td>
      <td style="white-space:nowrap;font-size:12px">${p.fourn||'—'}</td>
      <td>${bP(p.pareto)}</td>
      ${dispWks.map(k=>`<td style="text-align:right">${p.sems[k]>0?fmt(p.sems[k]):'—'}</td>`).join('')}
      <td style="text-align:right;font-weight:500">${fmt(p.vt)}</td>
      <td style="text-align:right;color:var(--t2)">${p.vn1>0?fmt(p.vn1):'—'}</td>
      <td style="text-align:right">${growHtml}</td>
      <td style="text-align:right;color:var(--t3);font-size:12px">${p.vm||'—'}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="'+(7+dispWks.length)+'" style="text-align:center;padding:40px;color:var(--t3)">Aucune vente</td></tr>';
}


// -----------------------------------------------------------------
// 5. INCOMING SHIPMENTS (Confirmed POs - rReceptions)
// -----------------------------------------------------------------
// This tab tracks the physical boxes that are currently on trucks or boats. 
// It groups them by Purchase Order (PO) number so the warehouse team knows exactly what is arriving.

// -----------------------------------------------------------------
// 5. INCOMING SHIPMENTS (Confirmed POs - rReceptions)
// -----------------------------------------------------------------
function rReceptions(){
  const srch=(document.getElementById('s-r')?.value||'').toLowerCase();
  const fourn=document.getElementById('f-r')?.value||'';
  const sw=document.getElementById('sw-r')?.value||'';
  const W=cw();

  // Helper function to filter by target delivery week
  function matchSemaine(c){
    if(!sw)return true;
    if(!c.livraison||c.livraison==='—')return true; // Don't hide orders without a date
    try{
      const d=new Date(c.livraison.split('/').reverse().join('-'));
      const s=new Date(d.getFullYear(),0,1);
      const cmdSw=Math.ceil(((d-s)/86400000+s.getDay()+1)/7);
      return cmdSw===parseInt(sw);
    }catch(e){ return true; }
  }

  // 1. Filter the Stocky Orders
  const sf=STOCKY.filter(c=>{
    if(!equipeMatch(c.fourn))return false;
    if(fourn&&c.fourn!==fourn)return false;
    if(srch&&!c.lignes.some(l=>l.nom.toLowerCase().includes(srch)))return false;
    return matchSemaine(c);
  });

  // 2. Filter the Transferts Orders
  const tf=TRANSFERTS.filter(c=>{
    if(!equipeMatch(c.fourn))return false;
    if(fourn&&c.fourn!==fourn)return false;
    if(srch&&!c.lignes.some(l=>l.nom.toLowerCase().includes(srch)))return false;
    return matchSemaine(c);
  });

  // 3. Update the total order count at the top of the screen
  document.getElementById('rc-r2').textContent=(sf.length+tf.length)+' commande(s)';

  // 4. Helper function to generate the HTML for a specific group of orders
  function renderGroupe(list, titre, prefix){
    if(!list.length)return '';
    let h=`<div class="sh"><span class="st">${titre} (${list.length})</span></div>`;
    h+=list.map((c,i)=>{
      const shouldOpen=srch.length>0;
      const openCls=shouldOpen?'open':'';
      const arrow=shouldOpen?'▲':'▼';
      return`
      <div class="rg">
        <div class="rh" onclick="toggleRec('rb${prefix}${i}','arr${prefix}${i}')">
          <span class="rh-cmd">PO #${c.cmd}</span>
          <span class="rh-f">${c.fourn}</span>
          <span class="rh-d">📅 ${c.livraison}</span>
          <span class="rh-cnt">${c.lignes.length} produit(s) · ${fmt(c.total)} unités <span id="arr${prefix}${i}">${arrow}</span></span>
        </div>
        <div class="rb ${openCls}" id="rb${prefix}${i}">
          <table style="width:100%">
            <thead><tr><th>Produit</th><th>Variante</th><th style="text-align:right">Qté</th></tr></thead>
            <tbody>${c.lignes.filter(l=>!srch||l.nom.toLowerCase().includes(srch)).map(l=>`<tr>
              <td>
                ${l.nom}
${l.com?`<div style="font-size:11px;color:var(--am);margin-top:3px">💬 ${l.com}</div>`:''}
</td>
              <td style="color:var(--t3);font-size:12px">${l.variante&&l.variante!=='Default Title'?l.variante:'—'}</td>
              <td style="text-align:right;font-weight:500">${fmt(l.qty)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`;
    }).join('');
    return h;
  }

  // 5. Build the final HTML by combining both groups
  let html = renderGroupe(sf, 'Commandes Stocky', 'S') + renderGroupe(tf, 'Commandes Transferts', 'T');

  if(!html)html='<div style="text-align:center;padding:50px;color:var(--t3)">Aucune réception en cours</div>';
  document.getElementById('rc-cont').innerHTML=html;
}




// Small helper to open/close the PO accordion menus
function toggleRec(id,aid){
  const b=document.getElementById(id);
  const a=document.getElementById(aid);
  const open=b.classList.toggle('open');
  if(a)a.textContent=open?'▲':'▼';
}

// -----------------------------------------------------------------
// 7. PURCHASE ORDERS BUILDER (rPO)
// -----------------------------------------------------------------
// This tab calculates exactly what needs to be ordered *this week* // based on the automated forecast, generating a ready-to-order list.

// -----------------------------------------------------------------
// 7. PURCHASE ORDERS BUILDER (rPO)
// -----------------------------------------------------------------
function rPO(){
  const W=cw();
  let semaines=gC('swpo').map(Number).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
  if(!semaines.length)semaines=[W];
  const swRef=semaines[0]; // semaine de référence pour les ajouts manuels/personnalisés
  const fpo=document.getElementById('f-po');
  const currentFourn=fpo?.value||'';
  const lblSem=semaines.length>1?('S'+String(semaines[0]).padStart(2,'0')+'–S'+String(semaines[semaines.length-1]).padStart(2,'0')):('S'+String(semaines[0]).padStart(2,'0'));
  
  if(fpo){
    const fournsAvecPO=Object.keys(PO_ENVOYES).filter(f2=>equipeMatch(f2)&&(PO_ENVOYES[f2]||[]).some(e=>e.lignes.some(l=>l.quantite>0)));
    const activeFourns=[...new Set([...PREVISION.filter(r=>semaines.some(sw=>r.sems[sw]>0)&&equipeMatch(r.fourn)).map(r=>r.fourn).filter(Boolean),...fournsAvecPO])].sort();
    fpo.innerHTML='<option value="">Tous fournisseurs actifs '+lblSem+'</option>'+activeFourns.map(f=>`<option${f===currentFourn?' selected':''}>${f}</option>`).join('');
  }
  
  const fourn=fpo?.value||'';
  const rowsCalc=PREVISION.filter(r=>{
    if(!equipeMatch(r.fourn))return false;
    if(fourn&&r.fourn!==fourn)return false;
    return semaines.some(sw=>r.sems[sw]>0);
  });
  
  // Fusion des ajouts manuels (ruptures/critiques ajoutées depuis la bulle)
  const rowsExtra=[];
  Object.entries(PO_EXTRAS).forEach(([f,lignes])=>{
    if(!equipeMatch(f))return;
    if(fourn&&f!==fourn)return;
    lignes.forEach(l=>{
      if(!(l.quantite>0))return;
      const p=PRODS.find(x=>x.idVariante===l.idVariante);
      const prixExtra=(COUT_MAP[l.idVariante]||0)||COUT_MAP[normKey(l.nom)]||(PRIX_FALLBACK_ID[l.idVariante]||0);      rowsExtra.push({nom:l.nom,fourn:f,cat:p?p.pareto:'C',delai:DELAIS_MAP[f]||0,
        prix:prixExtra,vm:p?p.vm||0:0,tc:l.quantite,sems:{[swRef]:l.quantite},
        _manuel:true,idVariante:l.idVariante});
    });
  });
  
  // Fusion des ajouts personnalisés
  const rowsCustom=[];
  Object.entries(PO_CUSTOM).forEach(([f,lignes])=>{
    if(!equipeMatch(f))return;
    if(fourn&&f!==fourn)return;
    lignes.forEach(cu=>{
      if(!(cu.quantite>0))return;
      rowsCustom.push({nom:cu.nom,fourn:f,cat:'C',delai:DELAIS_MAP[f]||0,
        prix:cu.prix||0,vm:0,tc:cu.quantite,sems:{[swRef]:cu.quantite},
        _custom:true,idVariante:'',customId:cu.id});
    });
  });
  
  const rows=[...rowsCalc,...rowsExtra,...rowsCustom];
  rows.forEach(r=>{
    const kOv=r.fourn+'||'+r.nom;
    if(PRIX_OVERRIDE[kOv]!=null)r.prix=PRIX_OVERRIDE[kOv];
  });
  
  // Un produit déjà inclus dans un PO créé pour ce fournisseur est masqué (déjà commandé)
  function idVEnvoyesFor(f){
    return new Set((PO_ENVOYES[f]||[]).flatMap(e=>e.lignes.map(l=>l.idVariante)));}
  function qtyEnvoyeeFor(f,idV){
    return (PO_ENVOYES[f]||[]).reduce((s,e)=>s+e.lignes.filter(l=>l.idVariante===idV).reduce((s2,l)=>s2+(l.quantite||0),0),0);}
  function estDejaCommande(r){
    const pMatch=PRODS.find(x=>x.nom===r.nom);
    const idV=r.idVariante||(pMatch?pMatch.idVariante:'');
    if(!idV)
      return false;
    return idVEnvoyesFor(r.fourn).has(idV);
  }
  function qtySel(r){
    return semaines.reduce((s,sw)=>s+(r.sems[sw]||0),0);}
  
  const total_montant=rows.reduce((s,r)=>estDejaCommande(r)?s:s+(qtySel(r)*(r.prix||0)),0);
  document.getElementById('rc-po').textContent=rows.length+' produit(s) · '+fmtM(total_montant);
  
  const bar=document.getElementById('po-budget-bar');
  const budgetVal=semaines.reduce((s,sw)=>{const b=BUDGET.find(x=>x.sn===sw);return s+(b?b.val:0);},0);
  
  if(bar&&budgetVal>0){
    bar.style.display='block';
    document.getElementById('po-budget-total').textContent=fmtM(budgetVal);
    const byF={};
    rows.forEach(r=>{
      if(!r.fourn||estDejaCommande(r))return;
      if(!byF[r.fourn])byF[r.fourn]=0;
      byF[r.fourn]+=qtySel(r)*(r.prix||0);
    });
    const fList=Object.entries(byF).sort((a,b)=>b[1]-a[1]);
    const fpo=document.getElementById('f-po');
    const curF=fpo?.value||'';
    document.getElementById('po-budget-fourns').innerHTML=fList.map(([f,m])=>{
      const fSafe=f.replace(/'/g,"&#39;");
      const active=curF===f;
      return '<span onclick="document.getElementById(\'f-po\').value=\''+fSafe+'\';rPO();" style="cursor:pointer;padding:4px 10px;border-radius:20px;font-size:12px;background:'+(active?'var(--br)':'var(--w)')+';color:'+(active?'#fff':'var(--t2)')+';border:1px solid '+(active?'var(--br)':'var(--b1)')+'">'+f+(m>0?' · '+fmtM(m):'' )+'</span>';
    }).join('');
  } else if(bar){bar.style.display='none';}

  // Ruptures/critiques hors de ce PO, groupées par fournisseur
  const nomsDejaPO=new Set(rows.map(r=>r.nom));
  const horsPO=PRODS.filter(p=>{
    if(!(p.statut==='rupture'||p.statut==='critique'))return false;
    if(!(p.demande_cumulee>0))return false;
    if(!equipeMatch(p.fourn))return false;
    if(fourn&&p.fourn!==fourn)return false;
    if(nomsDejaPO.has(p.nom))return false;
    // Déjà couverte par une commande en cours (en_cmd) suffisante : on ne l'affiche pas comme "non incluse"
    if(p.en_cmd>0&&(p.stock+p.en_cmd)>=p.demande_cumulee)return false;
    return true;
  });
  const byFournHP={};
  horsPO.forEach(p=>{if(!byFournHP[p.fourn])byFournHP[p.fourn]=[];byFournHP[p.fourn].push(p);});

  function renderHorsPO(f){
    const ps=byFournHP[f];
    if(!ps||!ps.length)return '';
    return `<div style="background:var(--amb);border:1px solid var(--am);border-radius:8px;padding:10px 14px;margin-top:10px">
      <div style="font-size:12px;font-weight:600;color:var(--am);margin-bottom:6px">⚠ ${ps.length} produit(s) en rupture/critique non inclus</div>
      ${ps.map(p=>{
        const manque=Math.max(1,Math.ceil((p.demande_cumulee||0)-(p.stock||0)-(p.en_cmd||0)));
        const idSafe=p.idVariante.replace(/'/g,"\\\\'");
        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px">
          <span style="flex:1">${p.nom}${p.variante?' — '+p.variante:''} <span style="color:${p.statut==='rupture'?'var(--re)':'var(--am)'};font-weight:600">(${p.statut})</span></span>
          <input type="number" min="1" value="${manque}" id="qty-hp-${p.idVariante}" style="width:55px;padding:3px 6px;border:1px solid var(--b2);border-radius:6px">
          <button class="fb" style="padding:3px 10px;font-size:11px" onclick="ajouterHorsPO('${idSafe}')">+ Ajouter</button>
        </div>`;
      }).join('')}
    </div>`;
  }

  function renderAjoutLibre(f,blocId){
    const fSafe=f.replace(/'/g,"\\\\'");
    return `<div style="margin-top:10px;position:relative">
      <input type="text" placeholder="🔍 Ajouter un autre produit de ce fournisseur…" id="search-${blocId}"
        style="width:100%;padding:7px 10px;border:1px solid var(--b2);border-radius:6px;font-size:12px"
        oninput="rechercherProduitBlock('${fSafe}','${blocId}')">
      <div id="search-res-${blocId}" style="display:none;position:absolute;z-index:5;background:var(--w);border:1px solid var(--b2);border-radius:6px;width:100%;max-height:220px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.08)"></div>
    </div>`;
  }

  function renderAjoutPersonnalise(f,blocId){
    const fSafe=f.replace(/'/g,"\\\\'");
    return `<div style="margin-top:8px;display:flex;gap:6px;align-items:center">
      <input type="text" placeholder="Nom du produit personnalisé…" id="cust-nom-${blocId}"
        style="flex:1;padding:6px 8px;border:1px solid var(--b2);border-radius:6px;font-size:12px">
      <input type="number" min="0" step="0.01" placeholder="Cout unit." id="cust-prix-${blocId}"
        style="width:90px;padding:6px 8px;border:1px solid var(--b2);border-radius:6px;font-size:12px;text-align:right">
      <input type="number" min="1" value="1" placeholder="Qté" id="cust-qte-${blocId}"
        style="width:60px;padding:6px 8px;border:1px solid var(--b2);border-radius:6px;font-size:12px;text-align:center">
      <button class="fb" style="padding:6px 12px;font-size:12px" onclick="ajouterProduitPersonnalise('${fSafe}','${blocId}')">+ Produit personnalisé</button>
    </div>`;
  }

  const aDesPOEnvoyesVisibles = Object.keys(PO_ENVOYES).some(f2=>equipeMatch(f2)&&(!fourn||f2===fourn)&&(PO_ENVOYES[f2]||[]).some(e=>e.lignes.some(l=>l.quantite>0)));
  if(!rows.length && !Object.keys(byFournHP).length && !aDesPOEnvoyesVisibles){document.getElementById('po-cont').innerHTML='<div style="text-align:center;padding:50px;color:var(--t3)">Aucune prévision pour cette période</div>';return;}
  const minW=semaines[0],maxW=semaines[semaines.length-1];
  const wks=[];for(let i=minW;i<=Math.min(52,maxW+2);i++)wks.push(i);
  const byF={};
  rows.forEach(r=>{if(!byF[r.fourn])byF[r.fourn]=[];byF[r.fourn].push(r);});
  
  // S'assurer que les fournisseurs ayant un PO déjà envoyé restent visibles et modifiables,
  // même si aucun produit n'a de besoin de réappro pour la période actuellement sélectionnée.
  Object.keys(PO_ENVOYES).forEach(f2=>{
    if(!equipeMatch(f2))return;
    if(fourn&&f2!==fourn)return;
    const idVDejaDansByF=new Set((byF[f2]||[]).map(r=>r.idVariante||(PRODS.find(x=>x.nom===r.nom)?.idVariante||'')));
    const idVCommittes=new Set((PO_ENVOYES[f2]||[]).flatMap(e=>e.lignes.map(l=>l.idVariante)));
    idVCommittes.forEach(idV=>{
      if(idVDejaDansByF.has(idV))return;
      const p=PRODS.find(x=>x.idVariante===idV);
      if(!p)return;
      if(!byF[f2])byF[f2]=[];
      byF[f2].push({nom:p.nom,fourn:f2,cat:p.pareto||'C',delai:DELAIS_MAP[f2]||0,
        prix:PRIX_ID_MAP[idV]||PRIX_MAP[normKey(p.nom)]||PRIX_FALLBACK_ID[idV]||0,
        vm:p.vm||0,tc:0,sems:{},idVariante:idV});
      idVDejaDansByF.add(idV);
    });
  });
  
  const tousFourns=[...new Set([...Object.keys(byF),...Object.keys(byFournHP)])].sort((a,b)=>a.localeCompare(b));
  let html='';
  window.PO_GROUPES=Object.entries(byF).sort((a,b)=>a[0].localeCompare(b[0]));
  window.PO_SEMAINES=semaines;
  
  tousFourns.forEach((f,blocIdx)=>{
    const prods=byF[f];
    const idx=window.PO_GROUPES.findIndex(([fg])=>fg===f);
    if(prods&&prods.length){
      const fm=prods.reduce((s,r)=>estDejaCommande(r)?s:s+(qtySel(r)*(r.prix||0)),0);
      const dejaEnvoyes=PO_ENVOYES[f]||[];
      const idVEnvoyes=idVEnvoyesFor(f);
      const aEnvoyer=prods.filter(r=>{
        const pMatch=PRODS.find(x=>x.nom===r.nom);
        const idV=r.idVariante||(pMatch?pMatch.idVariante:'');
        return idV&&!idVEnvoyes.has(idV);
      }).length;
      html+=`<div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-weight:600;font-size:13px;color:var(--t1)">${f}</span>
          <span style="font-size:12px;color:var(--t3)">${prods.length} produit(s)</span>
          ${fm>0?`<span style="margin-left:auto;font-weight:500;color:var(--br)">${fmtM(fm)}</span>`:''}
          <input type="date" id="date-po-${idx}" style="padding:5px 8px;border:1px solid var(--b2);border-radius:6px;font-size:12px;font-family:'Inter',sans-serif" title="Date de livraison (optionnel)">
          ${dejaEnvoyes.length?dejaEnvoyes.map(e=>{
            const fSafe2=f.replace(/'/g,"\\\\'");
            return `<span style="display:inline-flex;align-items:center;border-radius:6px;border:1px solid var(--gr);overflow:hidden">
              <span onclick="ouvrirModifPO('${fSafe2}','${e.poNumber}')" title="Cliquer pour ouvrir et modifier uniquement ce PO" style="cursor:pointer;font-size:12px;font-weight:600;padding:6px 8px;color:var(--gr);background:var(--grb)">✓ ${e.poNumber}</span>
              <span onclick="telechargerPDFUnPO('${fSafe2}','${e.poNumber}')" title="Télécharger le PDF de ce PO uniquement" style="cursor:pointer;font-size:12px;padding:6px 8px;color:var(--gr);background:var(--w);border-left:1px solid var(--gr)">📄</span>
            </span>`;
          }).join(''):''}
          ${aEnvoyer>0?`<button class="fb" id="btn-po-${idx}" onclick="envoyerCommandeFournisseur(${idx},[${semaines.join(',')}])" style="margin-left:${dejaEnvoyes.length?'0':'8px'}">${dejaEnvoyes.length?'Ajouter '+aEnvoyer+' produit(s)':'Créer la commande'}</button>`:''}
          <button class="fb" ${dejaEnvoyes.length?'':'disabled'} onclick="${dejaEnvoyes.length?`genererPDFPO(${idx},[${semaines.join(',')}])`:''}" style="margin-left:8px${dejaEnvoyes.length?'':';opacity:.4;cursor:not-allowed'}" title="${dejaEnvoyes.length?'':'Crée la commande pour obtenir le numéro de PO'}">📄 PDF fournisseur</button>
        </div>
        <div class="tw"><table>
          <thead><tr><th>Produit</th><th>Cat.</th><th style="text-align:right">Stock actuel</th><th>Délai</th>
          ${wks.map(i=>`<th style="text-align:center">S${String(i).padStart(2,'0')}${semaines.includes(i)?' ✎':''}</th>`).join('')}
          <th style="text-align:right">Total cmd</th><th style="text-align:center">Sem. couvertes</th><th style="text-align:right">Cout unit.</th><th style="text-align:right">Montant</th>
          </tr></thead>
          <tbody>${prods.map(r=>{
            const fournSafe=(r.fourn||'').replace(/'/g,"\\\\'");
            const idSafe=(r.idVariante||'').replace(/'/g,"\\\\'");
            const nomSafe=r.nom.replace(/'/g,"\\\\'");
            const special=r._manuel||r._custom;
            const dejaCommande=estDejaCommande(r);
            const pMatchIdV=r.idVariante||(PRODS.find(x=>x.nom===r.nom)?.idVariante||'');
            const entreesPourCeProduit=dejaCommande?dejaEnvoyes.filter(e=>e.lignes.some(l=>l.idVariante===pMatchIdV)):[];
            const entreeCommande=entreesPourCeProduit[0]||null;
            return `<tr${special?' style="background:var(--amb)"':''}>
            <td><div class="pn">${r.nom}${r._manuel?` <span style="font-size:10px;color:var(--am);font-weight:600">(ajout manuel) <a href="#" onclick="retirerExtra('${fournSafe}','${idSafe}');return false;" style="color:var(--re);text-decoration:underline">retirer</a></span>`:''}${r._custom?` <span style="font-size:10px;color:var(--am);font-weight:600">(produit personnalisé) <a href="#" onclick="retirerCustom('${fournSafe}','${r.customId}');return false;" style="color:var(--re);text-decoration:underline">retirer</a></span>`:''}</div>${(()=>{const p=PRODS.find(x=>x.nom===r.nom);return p&&p.variante?`<div class="pv">${p.variante}</div>`:''})()}</td>
            <td>${bP(r.cat)}</td>
            <td style="text-align:right">${(()=>{const p=PRODS.find(x=>x.nom===r.nom);return p?`<span class="${sc(p.stock)}">${fmt(p.stock)}</span>`:'—';})()}</td>
            <td style="text-align:center;font-size:12px">${r.delai>0?r.delai+' sem.':'—'}</td>
            ${dejaCommande?
              `<td colspan="${wks.length}" style="text-align:center;color:var(--gr);font-weight:600;font-size:12px">✓ Déjà commandé${entreesPourCeProduit.length?' ('+entreesPourCeProduit.map(e=>e.poNumber).join(', ')+')':''}</td>`
              :wks.map(i=>{
              if(semaines.includes(i)){
                const val=r.sems[i]||0;
                const style=special?'border:1px solid var(--am)':'border:1px solid var(--b2)';
                const tipo=r._custom?'custom':(r._manuel?'manuel':'normal');
                return `<td style="text-align:center"><input type="number" min="0" value="${val}" style="width:50px;padding:2px 4px;${style};border-radius:4px;font-size:12px;text-align:center" onchange="majQuantitePO('${fournSafe}','${idSafe}','${nomSafe}',${i},this.value,'${tipo}','${r.customId||''}')"></td>`;
              }
              if(special)return `<td style="text-align:center;color:var(--t3)">—</td>`;
              const v=r.sems[i]||0;
              return v>0?`<td style="text-align:center;background:var(--amb);color:var(--am);font-weight:600;font-size:12px;padding:8px 10px">${fmt(v)}</td>`:
                         `<td style="text-align:center;color:var(--t3)">—</td>`;
            }).join('')}
            <td style="text-align:right;font-weight:500">${r.tc>0?fmt(r.tc):'—'}</td>
            <td style="text-align:center">${dejaCommande?'<span style="color:var(--t3)">—</span>':(()=>{const qty=qtySel(r);const vm=r.vm||0;const p=PRODS.find(x=>x.nom===r.nom);const stockAct=p?p.stock:0;const enCmd=p?(p.en_cmd||0):0;if(qty>0&&vm>0){const wksCov=Math.round((stockAct+enCmd+qty)/vm);const ok=wksCov>=(r.delai||0);return `<span style="font-weight:600;color:${ok?'var(--gr)':'var(--re)'}">${wksCov} sem.</span>`;}return '<span style="color:var(--t3)">—</span>';})()}</td>
            <td style="text-align:right"><input type="number" min="0" step="0.01" value="${r.prix>0?r.prix.toFixed(2):''}" placeholder="—" style="width:75px;padding:2px 4px;border:1px solid var(--b2);border-radius:4px;font-size:12px;text-align:right;color:var(--t2)" onchange="majPrixPO('${fournSafe}','${nomSafe}',this.value)"></td>
            <td style="text-align:right;font-weight:500;color:var(--br)">${dejaCommande?'—':(r.prix>0?fmtM(qtySel(r)*r.prix):'—')}</td>
          </tr>`;}).join('')}</tbody>
        </table></div>
        ${renderHorsPO(f)}
        ${renderAjoutLibre(f,'b'+blocIdx)}
        ${renderAjoutPersonnalise(f,'b'+blocIdx)}
      </div>`;
    } else {
      // Fournisseur avec uniquement des ruptures/critiques hors PO, pas encore de commande calculée
      html+=`<div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-weight:600;font-size:13px;color:var(--t1)">${f}</span>
          <span style="font-size:12px;color:var(--t3)">0 produit(s) dans le PO calculé</span>
        </div>
        ${renderHorsPO(f)}
        ${renderAjoutLibre(f,'b'+blocIdx)}
        ${renderAjoutPersonnalise(f,'b'+blocIdx)}
      </div>`;
    }
  });
  document.getElementById('po-cont').innerHTML=html;
}

// -----------------------------------------------------------------
// 8. FINANCIAL BUDGET (Cash Flow Prediction)
// -----------------------------------------------------------------
// Draws the high-level cash flow overview week by week.

function rBudget(){
  const W=cw();
  document.getElementById('tb-b').innerHTML=BUDGET.map(b=>`
    <tr onclick="toggleBudget(${b.sn},'${b.label}',${b.val})" style="cursor:pointer;${SEL_BUDGET===b.sn?'background:var(--brl)':''}">
      <td>${b.label}${b.sn===W?' <span style="font-size:10px;color:var(--br);margin-left:5px">◀ courante</span>':''}</td>
      <td style="text-align:right;font-weight:${b.val>0?'500':'300'}">${b.val>0?fmtM(b.val):'—'}</td>
    </tr>`).join('')||'<tr><td colspan="2" style="text-align:center;padding:40px;color:var(--t3)">Aucune donnée</td></tr>';
}

// When you click a week in the budget, this opens a detailed breakdown 
// of exactly which suppliers that money is going to.
function toggleBudget(sn,label,total){
  const det=document.getElementById('bdet');
  if(!det) 
    return;
  
  if(SEL_BUDGET===sn){SEL_BUDGET=null;det.style.display='none';rBudget(); 
    return;}
  SEL_BUDGET=sn;
  const byF={};
  
  // Aggregate predicted costs by supplier
  PREVISION.forEach(r=>{
    const qty=r.sems[sn]||0;
    if(!qty||!r.fourn)
      return;
    if(!byF[r.fourn])byF[r.fourn]={qty:0,montant:0,produits:[],pos:[]};
    byF[r.fourn].qty+=qty;
    byF[r.fourn].montant+=qty*(r.prix||0);
    byF[r.fourn].produits.push(r.nom);
  });
  
  // Match with real POs if they already exist
  STOCKY.forEach(c=>{
    if(!c.livraison||c.livraison==='—') 
      return;
    try{
      const parts=c.livraison.split('/');
      const d=new Date(parseInt(parts[2]),parseInt(parts[1])-1,parseInt(parts[0]));
      const jan1=new Date(d.getFullYear(),0,1);
      const sw=Math.ceil(((d-jan1)/86400000+jan1.getDay()+1)/7);
      if(sw===sn){
        const f=c.fourn||'Inconnu';
        if(!byF[f])byF[f]={qty:0,montant:0,produits:[],pos:[]};
        byF[f].pos.push({cmd:c.cmd,total:c.total});
      }
    }catch(e){

    }
  });
  
  const fList=Object.entries(byF).sort((a,b)=>b[1].montant-a[1].montant);
  document.getElementById('bdet-title').textContent=label+' — détail par fournisseur';
  
  if(!fList.length){
    document.getElementById('bdet-body').innerHTML='<div style="text-align:center;padding:30px;color:var(--t3)">Aucune commande prévue</div>';
  } else {
    document.getElementById('bdet-body').innerHTML='<table style="width:100%"><thead><tr><th>Fournisseur</th><th>N° PO</th><th style="text-align:right">Unités</th><th style="text-align:right">Montant estimé</th></tr></thead><tbody>'+
      fList.map(([f,d])=>{
        const poHtml=d.pos.length>0?d.pos.map(p=>'<span style="font-family:monospace;font-size:11px;background:var(--blb,#e8f0fe);color:var(--bl,#1a73e8);padding:1px 6px;border-radius:4px;margin-right:3px">#'+p.cmd+'</span>').join(''):'<span style="color:var(--t3)">—</span>';
        const fSafe=f.replace(/'/g,"&#39;");
        return '<tr onclick="navPO(this)" data-fourn="'+fSafe+'" data-sw="'+sn+'" style="cursor:pointer"><td><div style="font-weight:500">'+f+'</div><div style="font-size:11px;color:var(--t3);margin-top:2px">'+d.produits.slice(0,2).join(', ')+(d.produits.length>2?' +'+(d.produits.length-2):'')+'</div></td><td>'+poHtml+'</td><td style="text-align:right">'+fmt(d.qty)+'</td><td style="text-align:right;font-weight:500;color:var(--br)">'+(d.montant>0?fmtM(d.montant):'—')+'</td></tr>';
      }).join('')+'</tbody></table>';
  }
  det.style.display='block';
  setTimeout(()=>det.scrollIntoView({behavior:'smooth',block:'start'}),50);
}

// Redirects the user from the Budget Breakdown directly to the specific PO tab
function navPO(el){
  const fourn=el?el.dataset.fourn.replace(/&#39;/g,"'"):arguments[0];
  const sw=el?+el.dataset.sw:arguments[1];
  const ni=document.querySelectorAll('.ni')[7];
  
  document.querySelectorAll('.ni').forEach(e=>e.classList.remove('on'));
  ni.classList.add('on');
  document.querySelectorAll('.view').forEach(e=>e.classList.remove('on'));
  document.getElementById('v-po').classList.add('on');
  CV='po';
  
  // 🚀 This is the new multi-select week update
  sC('swpo',[String(sw)]);
  updDD('dd-swpo','swpo');

  const fpo=document.getElementById('f-po');
  if(fpo){
    const activeFourns=[...new Set(PREVISION.filter(r=>r.sems[sw]>0).map(r=>r.fourn).filter(Boolean))].sort();
    fpo.innerHTML='<option value="">Tous fournisseurs actifs S'+String(sw).padStart(2,'0')+'</option>'+activeFourns.map(f=>`<option${f===fourn?' selected':''}>${f}</option>`).join('');
  }
  rPO();
}

// -----------------------------------------------------------------
// 9. MARKETING PROMOTIONS
// -----------------------------------------------------------------
function setPF(f,el){
  PF=f; // Updates the memory sticky note to track "All", "Active", or "Past" promos
  document.querySelectorAll('#v-promos .fb').forEach(b=>b.classList.remove('on'));
  el.classList.add('on');
  rPromos();
}

function rPromos(){
  const marque=document.getElementById('f-pr')?.value||'';
  const sw=parseInt(document.getElementById('sw-pr')?.value||'0')||0;
  const W=cw();
  
  const rows=PROMOS.filter(r=>{
    if(marque&&r.marque!==marque) 
      return false;
    if(sw>0&&!(r.sd<=sw&&r.sf>=sw)) 
      return false;
    // Categorize by time period
    if(PF==='active'&&!(r.sd<=W&&r.sf>=W)) 
      return false;
    if(PF==='coming'&&r.sd<=W) 
      return false;
    if(PF==='past'&&r.sf>=W) 
      return false;
    return true;
  });
  
  document.getElementById('rc-pr').textContent=rows.length+' promo(s)';
  document.getElementById('tb-pr').innerHTML=rows.map(r=>{
    const isA=r.sd<=W&&r.sf>=W;
    const isC=r.sd>W;
    const badge=isA?`<span class="bx bgr">Active</span>`:isC?`<span class="bx bbl">À venir</span>`:`<span class="bx bgy">Passée</span>`;
    
    // Format the Promo Price
    const prixHtml=r.prixPromo>0
      ?`<strong style="color:var(--br)">${r.prixPromo.toLocaleString('fr-CA',{minimumFractionDigits:2,maximumFractionDigits:2})} $</strong>`
      :'—';

    // Find the variant name from either the Master Inventory or the Promo Sheet fallback
    const varHtml = (() => {
        const p = PRODS.find(x => x.nom === r.produit || x.nb === r.produit);
        return p && p.variante ? `<div class="pv">${p.variante}</div>` : r.variante ? `<div class="pv">${r.variante}</div>` : '';
    })();

    return`<tr>
      <td><div class="pn">${r.produit}</div>${varHtml}</td>
      <td style="white-space:nowrap">${r.marque}</td>
      <td>${badge}</td>
      <td style="white-space:nowrap;font-size:12px">S${String(r.sd).padStart(2,'0')}–S${String(r.sf).padStart(2,'0')}</td>
      <td style="font-size:12px">${r.dd}</td>
      <td style="font-size:12px">${r.df}</td>
      <td style="text-align:right;font-weight:600;color:${r.boost>=30?'var(--gr)':r.boost>=15?'var(--am)':'var(--t1)'}">${r.boost>0?r.boost+'%':'—'}</td>
      <td style="text-align:right">${prixHtml}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--t3)">Aucune promo</td></tr>';
}

// -----------------------------------------------------------------
// 10. THE PLUMBING (Checkboxes, Menus, and Sidebars)
// -----------------------------------------------------------------
// These are the invisible mechanics that make the custom dropdowns work.

// Grabs all the currently "checked" values from a custom checkbox list
function gC(name){
  return[...document.querySelectorAll('input[name="'+name+'"]:checked')].map(e=>e.value);
}

// Automatically checks boxes based on a list (used by the KPI summary boxes)
function sC(name,vals){
  document.querySelectorAll('input[name="'+name+'"]').forEach(e=>{e.checked=vals.includes(e.value);});
}

// Unchecks all boxes in a dropdown and refreshes the table
function clearDD(ddId,name,cb){
  document.querySelectorAll('input[name="'+name+'"]').forEach(e=>e.checked=false);
  if(ddId)updDD(ddId,name);
  if(cb)cb();
}

// Opens and closes the custom floating dropdown panels
function toggleDD(id){
  document.querySelectorAll('.dd-panel.open').forEach(p=>{
    p.classList.remove('open');
    const src=p.dataset.ddSrc;
    if(src){const srcEl=document.getElementById(src);if(srcEl)srcEl.appendChild(p);}
  });
  const dd=document.getElementById(id);
  let panel=dd.querySelector('.dd-panel');
  if(!panel)panel=document.querySelector('.dd-panel[data-dd-src="'+id+'"]');
  if(!panel) 
    return;
  const btn=dd.querySelector('.dd-btn');
  const rect=btn.getBoundingClientRect();
  panel.dataset.ddSrc=id;
  document.body.appendChild(panel);
  panel.style.position='fixed';
  panel.style.top=(rect.bottom+4)+'px';
  panel.style.left=rect.left+'px';
  panel.style.zIndex='99999';
  panel.classList.add('open');
}

// Updates the text on the dropdown button (e.g., changes "Fournisseurs" to "Fournisseurs (2)")
function updDD(ddId,name){
  const dd=document.getElementById(ddId);
  if(!dd) 
    return;
  const btn=dd.querySelector('.dd-btn');
  const ch=gC(name);
  const lbl={fa:'Fournisseurs',fs:'Fournisseurs',fv:'Fournisseurs',fe:'Fournisseurs',ffc:'Fournisseurs',
    pa:'Pareto',ps:'Pareto',pf:'Pareto',pv:'Pareto',pe:'Pareto',pfc:'Pareto',
    sta:'Statut',sts:'Statut',stf:'Statut', swpo:'Semaines'}[name]||name;
  btn.textContent=ch.length?lbl+' ('+ch.length+')':lbl;
  btn.classList.toggle('on',ch.length>0);
}

// If you click anywhere outside the dropdown menu, close it
document.addEventListener('click',e=>{
  if(!e.target.closest('.dd')&&!e.target.closest('.dd-panel'))document.querySelectorAll('.dd-panel.open').forEach(p=>p.classList.remove('open'));
});

// Builds the custom multi-select checkboxes for all tabs (including Dormant Stock)
function populateFournDD(){
  [['ddl-fa','fa','rAlertes','dd-fa'],
    ['ddl-fs','fs','rStocks','dd-fs'],
    ['ddl-fv','fv','rVentes','dd-fv'],
    ['ddl-ffc','ffc','rForecast','dd-ffc'],
    ['ddl-fdormant','fdormant','rDormant','dd-fdormant']].forEach(([lid,name,cb,did])=>{
    const el=document.getElementById(lid);if(!el) 
      return;
    const list=lid==='ddl-ffc'?[...new Set(FORECAST.map(r=>r.fourn).filter(Boolean))].sort():FOURNISSEURS;
    el.innerHTML=list.map(f=>`<label class="dd-item"><input type="checkbox" name="${name}" value="${f.replace(/"/g,'&quot;')}" onchange="updDD('${did}','${name}');${cb}()"> ${f}</label>`).join('');
  });
}

function toggleSidebar(){
  const sb=document.querySelector('.sidebar'),ov=document.getElementById('overlay');
  const open=sb.classList.toggle('open');ov.classList.toggle('open',open);
}

function closeSidebarOnNav(){
  if(window.innerWidth<=768){document.querySelector('.sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('open');}
}

document.querySelectorAll('.ni').forEach(el=>el.addEventListener('click',closeSidebarOnNav));















// ==========================================================
// 11. THE DORMANT STOCK ALGORITHM (Separated Module)
// ==========================================================

function rDormant() {
    // Fetch User Inputs & Multi-Select Filters
    const thresholdWeeks = parseInt(document.getElementById('d-weeks').value) || 8;
    const selectedFourns = gC('fdormant'); 
    const CW = cw(); 

    // Retrieve sorting preferences from the global SORTS object
    const s = SORTS.d;
    const sortBy = s.col;
    const sortDir = s.dir;

    let totalUnits = 0;
    let totalCapital = 0;
    let tableRows = [];

    PRODS.forEach(p => {
        // Strict Filter 1: Only look at items with physical stock
        if (p.stock <= 0) 
          return;
        
        // ====================================================
        // NEW FILTER: EXCLUSION LIST 
        // These items skew data and should not be considered "Dead Stock"
        // ====================================================
        const lowerName = p.nom.toLowerCase();
        const isExcluded = 
            lowerName.includes("3 months of free coffee") ||
            lowerName.includes("decaf -swiss process") ||
            lowerName.includes("new wave") ||
            lowerName.includes("hoodies") ||
            lowerName.includes("gift card") ||
            lowerName.includes("bundle") ||
            lowerName.includes("demo") ||
            lowerName.includes("open box") ||
            lowerName.includes("return") ||
            lowerName.includes("refurbished") ||
            lowerName.includes("à vendre en boutique");

        // If the product matches any of the names above, skip it immediately
        if (isExcluded) 
          return;

        // Strict Filter 2: Multi-Select Supplier
        if (selectedFourns.length > 0 && !selectedFourns.includes(p.fourn)) 
          return;

        let weeksWithoutSale = 0;
        let lastSoldLabel = "Jamais Vendu";
        let foundSale = false;

        // REVERSE TRAVERSAL: Walk backwards from the current week to find the last sale
        for (let i = CW; i >= 1; i--) {
            let weekKey = 'S' + String(i).padStart(2, '0');
            if ((p.sems[weekKey] || 0) > 0) {
                lastSoldLabel = `S${String(i).padStart(2, '0')} (N)`;
                foundSale = true;
                break;
            }
            weeksWithoutSale++;
        }

        // Flag as Dormant (Math & KPIs)
        if (!foundSale) {
            const monthsFr = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
            // N-1 months array goes from index 0 (Jan) to 11 (Dec)
            for (let m = 11; m >= 0; m--) {
                if ((p.vn1_months[m] || 0) > 0) {
                    lastSoldLabel = `${monthsFr[m]} (N-1)`;
                    weeksWithoutSale += ((12 - m) * 4.33); // Convert months to approx weeks
                    foundSale = true;
                    break;
                }
            }
        }

        if (!foundSale || weeksWithoutSale >= thresholdWeeks) {
            let itemCapital = p.stock * p.cout;
            let velocity = p.vt + p.vn1; // Combined current year and previous year velocity
            let sortDateScore = foundSale ? weeksWithoutSale : 9999; 

            totalUnits += p.stock;
            totalCapital += itemCapital;

            tableRows.push({
                product: p,
                capital: itemCapital,
                velocity: velocity,
                lastSold: lastSoldLabel,
                sortDate: sortDateScore
            });
        }
    });

    // Sorting Engine
    tableRows.sort((a, b) => {
        let valA, valB;
        
        if (sortBy === 'capital') { valA = a.capital; valB = b.capital; }
        else if (sortBy === 'stock') { valA = a.product.stock; valB = b.product.stock; }
        else if (sortBy === 'cout') { valA = a.product.cout; valB = b.product.cout; }
        else if (sortBy === 'velocity') { valA = a.velocity; valB = b.velocity; }
        else if (sortBy === 'date') { valA = a.sortDate; valB = b.sortDate; } // Smaller number = More recent
        else if (sortBy === 'pareto') {
            const rankMap = { 'A': 0, 'B': 1, 'C': 2 };
            valA = rankMap[a.product.pareto] ?? 3;
            valB = rankMap[b.product.pareto] ?? 3;
        } 
        else if (sortBy === 'nom') { valA = a.product.nom.toLowerCase(); valB = b.product.nom.toLowerCase(); }
        else if (sortBy === 'fourn') { valA = (a.product.fourn||'').toLowerCase(); valB = (b.product.fourn||'').toLowerCase(); }

        // Alphabetical sort calculation
        if (typeof valA === 'string') {
            return valA < valB ? -sortDir : (valA > valB ? sortDir : 0);
        }
        // Numerical sort calculation
        return (valA - valB) * sortDir; 
    });

    // UI Updates
    document.getElementById('kpi-d-units').textContent = fmt(totalUnits);
    document.getElementById('kpi-d-capital').textContent = fmtM(totalCapital);
    document.getElementById('rc-dormant').textContent = tableRows.length + ' produit(s)';


    // Compile the Tier A Top Performers list for the simulation dropdowns
    const tierAProds = PRODS.filter(p => p.pareto === 'A');
    let optionsA = '<option value="">Sélectionner cible A...</option>';
    tierAProds.forEach(p => {
        if (!p.id) return; // Only use products with a valid Variant ID
        optionsA += `<option value="${p.id}">${p.nom}${p.variante ? ' - ' + p.variante : ''}</option>`;
    });


    // Render Table
    document.getElementById('tb-dormant').innerHTML = tableRows.map(row => {
        const p = row.product;
        return `
        <tr>
            <td>
                <div class="pn">${p.nom}</div>
                ${p.variante ? `<div class="pv">${p.variante}</div>` : ''}
            </td>
            <td style="font-size:12px;color:var(--t2);">${p.fourn || '—'}</td>
            <td>${bP(p.pareto)}</td>
            <td style="text-align:right;"><span class="${sc(p.stock)}">${fmt(p.stock)}</span></td>
            <td style="text-align:right; color:var(--t3);">${p.cout > 0 ? fmtM(p.cout) : '—'}</td>
            <td style="text-align:right; font-weight:600; color:var(--re);">${row.capital > 0 ? fmtM(row.capital) : '—'}</td>
            <td style="text-align:center;">
                <span style="font-size:11px; padding:3px 6px; border-radius:4px; background:${row.lastSold === 'Jamais Vendu' ? 'var(--reb)' : 'var(--amb)'}; color:${row.lastSold === 'Jamais Vendu' ? 'var(--re)' : 'var(--am)'};">
                    ${row.lastSold}
                </span>
            </td>
            <td style="text-align:right; font-weight:500;">${fmt(row.velocity)}</td>
            <td style="text-align:center;">
                <select class="fsel" style="max-width: 140px; font-size: 11px;" onchange="simulerLigne(this.value, ${row.capital})">
                    ${optionsA}
                </select>
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--t3)">Aucun stock dormant détecté 🎉</td></tr>`;
}

// ==========================================================
// 12. CSV EXPORT ENGINE
// ==========================================================
// Scrapes the visible HTML table and converts it into a downloadable file.

function exportDormantCSV() {
    const table = document.querySelector('#v-dormant table');
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        let rowData = [];
        const cols = row.querySelectorAll('th, td');
        
        cols.forEach(col => {
            // Replaces HTML line breaks with a simple dash for Excel compatibility
            let text = col.innerText.replace(/(\r\n|\n|\r)/gm, " - "); 
            text = text.replace(/"/g, '""'); // Escapes internal quotes
            rowData.push(`"${text}"`);
        });
        csvContent += rowData.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Stock_Dormant_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click(); // Automates the download click
    document.body.removeChild(link);
}

// ==========================================================
// 13. ROW-BY-ROW OPPORTUNITY COST ENGINE
// ==========================================================

// NEW HELPER: Calculates the custom profit in real-time as the user types
function majSimulationPersonnalisee(qte, profitUnitaire) {
    const resultEl = document.getElementById('custom-profit-result');
    if (!resultEl) return;
    
    const val = (parseInt(qte) || 0) * profitUnitaire;
    resultEl.textContent = (val > 0 ? '+' : '') + fmtM(val);
    resultEl.style.color = val >= 0 ? 'var(--gr)' : 'var(--re)';
}

function simulerLigne(targetId, capitalDisponible) {
    const receiptCard = document.getElementById('kpi-receipt-card');
    const receiptTitle = document.getElementById('receipt-title');
    const receiptContent = document.getElementById('receipt-content');

    if (!receiptCard || !receiptTitle || !receiptContent) return; // Safety check

    // If the user clears the dropdown, reset the card
    if (!targetId) {
        receiptTitle.textContent = "Simulation d'Opportunité";
        receiptContent.innerHTML = `<div style="font-size: 13px; color: var(--t3); text-align: center; padding: 20px 0;">Sélectionnez une cible Tier A dans le tableau pour lancer la simulation financière.</div>`;
        return;
    }

    // 1. Find the target Tier A product using the precise Variant ID
    const targetProd = PRODS.find(x => x.id === targetId);
    if (!targetProd) return;

    // 2. Retrieve Costs and Prices directly from the global maps
    const targetCost = targetProd.cout || 0;
    // Check ID first. If 0, try the Short Name. If 0, try the Full Name.
    const targetPrice = PRIX_MAP[targetId] || PRIX_MAP[targetProd.nom] || PRIX_MAP[targetProd.nb] || 0;

    console.log("Debug - TargetID:", targetId, "Nom:", targetProd.nom, "Prix Trouvé:", targetPrice);
    const profitPerUnit = targetPrice - targetCost;

    // 3. Math Step 1: Purchasing Power
    let simulatedUnitsPurchased = 0;
    if (targetCost > 0) {
        simulatedUnitsPurchased = Math.floor(capitalDisponible / targetCost);
    }

    // 4. Math Step 2: Demand Ceiling (4-Month Forward Look)
    const moisNoms = ['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];
    const currentMonthIdx = new Date().getMonth();
    let demandCeiling = 0;
    let demandSourceLabel = "";

    // Search the automated forecast data
    const targetFc = FORECAST.find(f => f.nom === targetProd.nom);
    if (targetFc) {
        for(let i = 0; i < 4; i++) {
            const mIdx = (currentMonthIdx + i) % 12; // Loops back to Jan if we hit Dec
            demandCeiling += targetFc[moisNoms[mIdx]] || 0;
        }
        if (demandCeiling > 0) {
            const endMonthIdx = (currentMonthIdx + 3) % 12;
            demandSourceLabel = `Forecast auto (M${String(currentMonthIdx+1).padStart(2,'0')}-M${String(endMonthIdx+1).padStart(2,'0')})`;
        }
    }

    // FALLBACK LOGIC: True Velocity (If forecast is 0 or missing)
    if (demandCeiling <= 0) {
        const currentWk = cw(); // Get current week of the year
        const ytdSales = targetProd.vt || 0;  // Total Ventes N
        const lastYearSales = targetProd.vn1 || 0; // Total Ventes N-1

        let trueWeeklyAvg = 0;

        // 1. Prioritize current year's pacing if we have sales this year
        if (currentWk > 0 && ytdSales > 0) {
            trueWeeklyAvg = ytdSales / currentWk;
        } 
        // 2. If no sales this year, look at last year's total pacing
        else if (lastYearSales > 0) {
            trueWeeklyAvg = lastYearSales / 52;
        }

        if (trueWeeklyAvg > 0) {
            // Multiply true average by 16 weeks. Use Math.max to guarantee at least 1 unit if history exists
            demandCeiling = Math.max(1, Math.round(trueWeeklyAvg * 16)); 
            
            // Format the true average to 2 decimal places for the UI
            const formattedAvg = trueWeeklyAvg.toLocaleString('fr-CA', {minimumFractionDigits: 1, maximumFractionDigits: 2});
            demandSourceLabel = `Tendance historique (${formattedAvg} / sem)`;
        } else {
            // 3. If there is absolutely zero history and zero forecast, do not invent demand.
            demandCeiling = 0; 
            demandSourceLabel = `Aucune demande historique`;
        }
    }

    // 5. Math Step 3: Constraint Logic (Pick the lower number to be safe)
    const finalSimulatedUnitsSold = Math.min(simulatedUnitsPurchased, demandCeiling);
    
    // 6. Math Step 4: Final Profit Calculation
    const finalProjectedGrossProfit = finalSimulatedUnitsSold * profitPerUnit;

    // 7. Inject the "Receipt" into the UI
    let nomComplet = targetProd.nom;
    // Vérifie si la variante existe ET si elle n'est pas déjà incluse dans le nom par défaut
    if (targetProd.variante && !nomComplet.includes(targetProd.variante)) {
        nomComplet += ` - ${targetProd.variante}`;
    }
    receiptTitle.textContent = `Simulation : ${nomComplet}`;
    
    // UI Polish: Colors and Signs
    const isProfitable = finalProjectedGrossProfit >= 0;
    const profitColor = isProfitable ? 'var(--gr)' : 'var(--re)';
    const sign = isProfitable ? '+' : '';

    receiptContent.innerHTML = `
        <div class="receipt-total" style="color: ${profitColor};">
            ${sign}${fmtM(finalProjectedGrossProfit)} 
            <span style="font-size: 11px; font-weight: normal; color: var(--t3);">Profit Brut Projeté</span>
        </div>
        <ul class="receipt-list">
            <li class="receipt-item">
                <strong>1. Pouvoir d'achat :</strong> 
                <span>${fmtM(capitalDisponible)} permet d'acheter <span class="em">${fmt(simulatedUnitsPurchased)} unités</span></span>
                <span class="receipt-source">Coût: ${fmtM(targetCost)}</span>
            </li>
            <li class="receipt-item">
                <strong>2. Demande (4 mois) :</strong> 
                <span>Le marché absorbera <span class="em">${fmt(demandCeiling)} ventes</span></span>
                <span class="receipt-source">${demandSourceLabel}</span>
            </li>
            <li class="receipt-item">
                <strong>3. Ventes retenues :</strong> 
                <span>La simulation limite à <span class="em">${fmt(finalSimulatedUnitsSold)} unités</span></span>
                <span class="receipt-source">Le plus bas de 1 ou 2</span>
            </li>
            <li class="receipt-item">
                <strong>4. Marge unitaire :</strong> 
                <span class="em">${fmtM(profitPerUnit)} / unité</span>
                <span class="receipt-source">Prix: ${fmtM(targetPrice)}</span>
            </li>
            <li class="receipt-item" style="background: var(--bg3, #fdfbf7); border: 1px solid var(--b2); margin-top: 8px; padding: 10px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px;">
    
              <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <strong>Simulation Custom :</strong>
                <div style="display:flex; align-items: center; gap: 8px; font-size: 12px;">
                <span>Si j'achète</span>
                <input type="number" min="0" placeholder="0" style="width: 70px; padding: 4px; border: 1px solid var(--b2); border-radius: 4px; font-size: 12px; text-align: center;" oninput="majSimulationPersonnalisee(this.value, ${profitPerUnit})">
                <span>unités</span>
                </div>
                </div>
                <span id="custom-profit-result" style="color: var(--gr); font-weight: 700; font-size: 14px; text-align: right; min-width: 80px;">+0 $</span>
              </li>
        </ul>
    `;
}

// =====================================================================
// 🚀 MODULE DE GÉNÉRATION DES BON DE COMMANDE (PO) EN PDF IMPRIMABLE
// =====================================================================

/**
 * Construit et ouvre un document PO dans un nouvel onglet avec mise en page épurée
 * @param {string} fourn - Nom du fournisseur
 * @param {string} poNum - Numéro du bon de commande (PO)
 * @param {string} dateLivraison - Date d'arrivée estimée
 * @param {Array} lignes - Liste des lignes [{nom, variante, sku, qte, prix}]
 */
function ouvrirDocumentPO(fourn, poNum, dateLivraison, lignes){
  const today = new Date().toLocaleDateString('fr-CA', {day:'numeric', month:'long', year:'numeric'});
  const fmt2 = v => n(v).toLocaleString('fr-CA', {minimumFractionDigits:2, maximumFractionDigits:2})+' $';

  let sousTotal = 0;
  const lignesHtml = lignes.map(l => {
    const total = l.qte * l.prix;
    sousTotal += total;
    return `<tr>
      <td style="padding:10px 0; border-bottom:1px solid #E5E0D8">
        <div style="font-weight:600">${l.nom}</div>
        ${l.variante ? `<div style="font-size:12px; color:#6B6560">${l.variante}</div>` : ''}
      </td>
      <td style="padding:10px 0; border-bottom:1px solid #E5E0D8; font-size:12px; color:#6B6560">${l.sku || '—'}</td>
      <td style="padding:10px 0; border-bottom:1px solid #E5E0D8; text-align:center">${l.qte}</td>
      <td style="padding:10px 0; border-bottom:1px solid #E5E0D8; text-align:right">${fmt2(l.prix)}</td>
      <td style="padding:10px 0; border-bottom:1px solid #E5E0D8; text-align:right">0%</td>
      <td style="padding:10px 0; border-bottom:1px solid #E5E0D8; text-align:right; font-weight:600">${fmt2(total)}</td>
    </tr>`;
  }).join('');

  const ADRESSE = 'Café Liégeois Canada Inc.<br>5524 Rue Saint-Patrick<br>Suite 140<br>Montréal QC H4E 1A8<br>Canada';
  const fournSafe = fourn.replace(/</g, '&lt;');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>PO — ${fournSafe}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif; color:#1A1714; padding:50px 60px; max-width:900px; margin:0 auto}
    .topline{display:flex; justify-content:space-between; font-size:13px; color:#6B6560; margin-bottom:34px}
    .titleline{display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:34px}
    h1{font-size:30px; font-weight:700; margin:0}
    .ponum{text-align:right; font-size:14px; line-height:1.5}
    .ponum .n{font-weight:700; font-size:16px}
    .cols3{display:flex; gap:40px; margin-bottom:22px}
    .cols3 > div{flex:1}
    .lbl{font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#1A1714; margin-bottom:8px}
    .val{font-size:13px; color:#1A1714; line-height:1.5}
    hr{border:none; border-top:2px solid #1A1714; margin:22px 0}
    table{width:100%; border-collapse:collapse; font-size:13px}
    th{text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding-bottom:10px; border-bottom:2px solid #1A1714}
    .sum{width:320px; margin-left:auto; margin-top:20px; font-size:13px}
    .sum div{display:flex; justify-content:space-between; padding:6px 0}
    .sum .tot{border-top:2px solid #1A1714; font-weight:700; font-size:15px; padding-top:10px; margin-top:6px}
    .foot{margin-top:60px; padding-top:16px; border-top:1px solid #D5CFC6; font-size:12px; color:#6B6560}
    @media print{ body{padding:20px 40px} }
  </style></head><body>
    <div class="topline"><span>Café Liégeois Canada Inc.</span><span>#${poNum}</span></div>
    <div class="titleline">
      <h1>Café Liégeois Canada Inc.</h1>
      <div class="ponum"><div class="n">#${poNum}</div><div>${today}</div></div>
    </div>
    <div class="cols3">
      <div><div class="lbl">Fournisseur</div><div class="val">${fournSafe}</div></div>
      <div><div class="lbl">Expédier à</div><div class="val">${ADRESSE}</div></div>
      <div><div class="lbl">Facturer à</div><div class="val">${ADRESSE}</div></div>
    </div>
    <div class="cols3">
      <div><div class="lbl">Modalités de paiement</div><div class="val">Paiement à la livraison</div></div>
      <div><div class="lbl">Devise du fournisseur</div><div class="val">CAD</div></div>
      <div><div class="lbl">Arrivée estimée</div><div class="val">${dateLivraison}</div></div>
    </div>
    <hr>
    <table>
      <thead><tr><th>Produits</th><th>SKU du fournisseur</th><th style="text-align:center">Qté</th><th style="text-align:right">Coût</th><th style="text-align:right">Taxe</th><th style="text-align:right">Total (CAD)</th></tr></thead>
      <tbody>${lignesHtml}</tbody>
    </table>
    <div class="sum">
      <div><span>Taxes (incluses)</span><span>${fmt2(0)}</span></div>
      <div><span>Sous-total (${lignes.length} article${lignes.length>1?'s':''})</span><span>${fmt2(sousTotal)}</span></div>
      <div class="tot"><span>Total</span><span>${fmt2(sousTotal)}</span></div>
    </div>
    <div class="foot">
      <div style="font-weight:700; margin-bottom:4px">Café Liégeois Canada Inc.</div>
      <div>5524 Rue Saint-Patrick</div>
      <div>info@cafeliegeois.ca</div>
    </div>
    <script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if(!w){ alert("Le navigateur a bloqué l'ouverture de la fenêtre. Autorisez les pop-ups pour ce site."); return; }
  w.document.write(html);
  w.document.close();
}

/**
 * Déclenche l'impression globale du PO cumulé pour un bloc fournisseur
 */
function genererPDFPO(idx, semaines){
  const grp = window.PO_GROUPES && window.PO_GROUPES[idx];
  if(!grp) return;
  const [fourn] = grp;

  const dejaEnvoyes = PO_ENVOYES[fourn] || [];
  if(!dejaEnvoyes.length){ alert('Aucune commande créée pour ce fournisseur — créez le PO d\'abord.'); return; }
  const poNum = dejaEnvoyes.map(e => e.poNumber).join(', ');
  const revision = dejaEnvoyes.length > 1 ? ' — révision ' + dejaEnvoyes.length : '';

  const dateInput = document.getElementById('date-po-' + idx);
  const dateLivraison = (dateInput && dateInput.value)
    ? new Date(dateInput.value + 'T00:00:00').toLocaleDateString('fr-CA', {day:'numeric', month:'long', year:'numeric'})
    : '-';

  const totalParId = {};
  dejaEnvoyes.forEach(e => e.lignes.forEach(l => { totalParId[l.idVariante] = (totalParId[l.idVariante] || 0) + (l.quantite || 0); }));

  const lignes = Object.entries(totalParId).filter(([,qte]) => qte > 0).map(([idV, qte]) => {
    const p = PRODS.find(x => x.idVariante === idV);
    const kOv = fourn + '||' + (p ? p.nom : '');
    // Respect strict des coûts
    const prix = (p && PRIX_OVERRIDE[kOv] != null) ? PRIX_OVERRIDE[kOv] : ((COUT_MAP[idV] || 0) || (PRIX_FALLBACK_ID[idV] || 0));
    return {
      nom: p ? p.nom : '(produit introuvable — ' + idV + ')',
      variante: p && p.variante ? p.variante : '',
      sku: p && p.skuFourn ? p.skuFourn : '—',
      qte, prix
    };
  });

  ouvrirDocumentPO(fourn, poNum + revision, dateLivraison, lignes);
}

/**
 * Télécharge le document PDF d'un seul PO ciblé spécifiquement
 */
function telechargerPDFUnPO(fourn, poNumber){
  const entree = (PO_ENVOYES[fourn] || []).find(e => e.poNumber === poNumber);
  if(!entree){ alert('PO introuvable.'); return; }
  const lignes = entree.lignes.filter(l => l.quantite > 0).map(l => {
    const p = PRODS.find(x => x.idVariante === l.idVariante);
    return {
      nom: l.nom || (p ? p.nom : '(produit non identifié)'),
      variante: l.variante || (p && p.variante ? p.variante : ''),
      sku: l.sku || (p && p.skuFourn ? p.skuFourn : '—'),
      qte: l.quantite,
      prix: (COUT_MAP[l.idVariante] || 0) || (p ? (COUT_MAP[normKey(p.nom)] || 0) : 0) || (PRIX_FALLBACK_ID[l.idVariante] || 0)
    };
  });
  ouvrirDocumentPO(fourn, poNumber, '-', lignes);
}

/**
 * Permet au modal de modification de PO d'imprimer l'état actuel de ses lignes
 */
function telechargerPDFDepuisModal(){
  if(!MODIF_PO_CTX) return;
  const {fourn, poNumber} = MODIF_PO_CTX;
  const lignes = MODIF_PO_LINES.filter(l => l.quantite > 0).map(l => ({
    nom: l.nom, variante: l.variante || '', sku: l.sku || '—', qte: l.quantite, prix: l.prix || 0
  }));
  ouvrirDocumentPO(fourn, poNumber, '-', lignes);
}

// =====================================================================
// 🚀 BACKEND SYNC & MODAL CONTROLLERS (SHOPIFY API)
// =====================================================================

async function envoyerLignesAuBackend(fourn, note, lignes, dateLivraison){
  const resp = await fetch(URL_AS, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // évite le preflight CORS
    body: JSON.stringify({ fournisseur: fourn, note: note, dateLivraison: dateLivraison, lignes: lignes })
  });
  return await resp.json();
}

async function envoyerCommandeFournisseur(idx, semaines){
  const sems = Array.isArray(semaines) ? semaines : [semaines];
  const grp = window.PO_GROUPES && window.PO_GROUPES[idx];
  if(!grp) return;
  const [fourn, prods] = grp;

  const dejaEnvoyes = PO_ENVOYES[fourn]||[];
  const idVEnvoyes = new Set(dejaEnvoyes.flatMap(e=>e.lignes.map(l=>l.idVariante)));

  const lignes = prods.map(r=>{
    const p = PRODS.find(x=>x.nom===r.nom);
    return { idVariante: r.idVariante || (p ? p.idVariante : ''), quantite: sems.reduce((s,sw)=>s+(r.sems[sw]||0),0), nom:r.nom, variante:p&&p.variante?p.variante:'', sku:p&&p.skuFourn?p.skuFourn:'' };
  }).filter(l => l.idVariante && l.quantite > 0 && !idVEnvoyes.has(l.idVariante));

  if(!lignes.length){
    alert('Tous les produits de ce fournisseur ont déjà été commandés (voir les PO déjà créés ci-dessus). Ajoute un nouveau produit avant de recommander.');
    return;
  }

  const btn = document.getElementById('btn-po-' + idx);
  if(btn){ btn.disabled = true; btn.textContent = 'Envoi…'; }

  const dateInput = document.getElementById('date-po-' + idx);
  const dateLivraison = dateInput ? dateInput.value : '';

  try {
    const note = 'Commande créée depuis le dashboard - semaine(s) ' + sems.map(s=>'S'+String(s).padStart(2,'0')).join(', ') + (dejaEnvoyes.length?' (complément)':'');
    const data = await envoyerLignesAuBackend(fourn, note, lignes, dateLivraison);

    if(data.success){
      if(!PO_ENVOYES[fourn])PO_ENVOYES[fourn]=[];
      PO_ENVOYES[fourn].push({poNumber:data.poNumber, lignes:lignes.map(l=>({idVariante:l.idVariante,quantite:l.quantite,nom:l.nom,variante:l.variante,sku:l.sku})), date:new Date().toISOString()});
      if(data.lignesIgnorees && data.lignesIgnorees.length > 0){
        alert('Commande créée (' + data.poNumber + '), mais ' + data.lignesIgnorees.length + ' ligne(s) ignorée(s) — ID(s) variante introuvable(s) : ' + data.lignesIgnorees.join(', '));
      }
      if(data.dateAvertissement){
        alert(data.dateAvertissement);
      }
      rPO();
    } else {
      let msg = 'Erreur : ' + (data.error || 'inconnue');
      if(data.lignesIgnorees && data.lignesIgnorees.length > 0){
        msg += '\n\nID(s) variante en cause : ' + data.lignesIgnorees.join(', ');
      }
      alert(msg);
      if(btn){ btn.disabled = false; btn.textContent = 'Créer la commande'; }
    }

  } catch(err){
    alert('Erreur réseau : ' + err.message);
    if(btn){ btn.disabled = false; btn.textContent = 'Créer la commande'; }
  }
}

// ============================================================
// Modification d'un PO déjà envoyé (MODAL)
// ============================================================
function ouvrirModifPO(fourn, poNumber){
  const entree = (PO_ENVOYES[fourn]||[]).find(e=>e.poNumber===poNumber);
  if(!entree){ alert('PO introuvable.'); return; }

  MODIF_PO_CTX = {fourn, poNumber};
  MODIF_PO_LINES = entree.lignes.filter(l=>l.quantite>0).map(l=>{
    const p = PRODS.find(x=>x.idVariante===l.idVariante);
    return {
      idVariante: l.idVariante||'',
      nom: l.nom || (p?p.nom:'(produit non identifié)'),
      variante: l.variante || (p&&p.variante?p.variante:''),
      sku: l.sku || (p&&p.skuFourn?p.skuFourn:''),
      quantiteOriginale: l.quantite,
      quantite: l.quantite,
      prix: p ? (COUT_MAP[l.idVariante]||COUT_MAP[normKey(p.nom)]||PRIX_FALLBACK_ID[l.idVariante]||0) : 0
    };
  });

  document.getElementById('mp-titre').textContent = 'Modifier le PO '+poNumber+' — '+fourn;
  document.getElementById('mp-add-input').value='';
  document.getElementById('mp-add-res').style.display='none';
  renderLignesModifPO();
  document.getElementById('modal-modifpo-overlay').style.display = 'flex';
}

function fermerModifPO(){
  document.getElementById('modal-modifpo-overlay').style.display = 'none';
  MODIF_PO_CTX = null;
  MODIF_PO_LINES = [];
}

function majQuantiteModifPOLigne(idx, val){
  MODIF_PO_LINES[idx].quantite = Math.max(0, parseInt(val)||0);
  renderLignesModifPO();
}

function retirerLigneModifPO(idx){
  MODIF_PO_LINES.splice(idx,1);
  renderLignesModifPO();
}

function rechercherProduitModifPO(){
  if(!MODIF_PO_CTX)return;
  const q=document.getElementById('mp-add-input').value.trim().toLowerCase();
  const resDiv=document.getElementById('mp-add-res');
  if(!q){resDiv.style.display='none';resDiv.innerHTML='';return;}

  const dejaDansModif=new Set(MODIF_PO_LINES.map(l=>l.idVariante).filter(Boolean));
  const matches=PRODS.filter(p=>
    p.idVariante && p.fourn===MODIF_PO_CTX.fourn && !dejaDansModif.has(p.idVariante) && p.nom.toLowerCase().includes(q)
  ).slice(0,8);

  if(!matches.length){
    resDiv.style.display='block';
    resDiv.innerHTML='<div style="padding:10px;color:var(--t3);font-size:12px">Aucun résultat pour ce fournisseur</div>';
    return;
  }
  resDiv.style.display='block';
  resDiv.innerHTML=matches.map(p=>{
    const idSafe=p.idVariante.replace(/'/g,"\\'");
    return `<div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--b1);font-size:12px" onclick="ajouterProduitModifPO('${idSafe}')">
      <div style="font-weight:500">${p.nom}</div>
      ${p.variante?`<div style="color:var(--t3);font-size:11px">${p.variante}</div>`:''}
    </div>`;
  }).join('');
}

function ajouterProduitModifPO(idVariante){
  const p=PRODS.find(x=>x.idVariante===idVariante);
  if(!p)return;
  MODIF_PO_LINES.push({
    idVariante:p.idVariante, nom:p.nom, variante:p.variante||'', sku:p.skuFourn||'',
    quantiteOriginale:0, quantite:1,
    prix:COUT_MAP[idVariante]||COUT_MAP[normKey(p.nom)]||PRIX_FALLBACK_ID[idVariante]||0
  });
  document.getElementById('mp-add-input').value='';
  document.getElementById('mp-add-res').style.display='none';
  renderLignesModifPO();
}

function renderLignesModifPO(){
  const cont = document.getElementById('mp-lignes');
  let total = 0;
  cont.innerHTML = MODIF_PO_LINES.map((l,idx)=>{
    total += l.quantite*l.prix;
    const delta = l.quantite - l.quantiteOriginale;
    let deltaTxt = '';
    if(!l.idVariante) deltaTxt = `<span style="color:var(--am);font-size:11px">⚠ non rattaché au catalogue — impossible d'envoyer un complément automatique pour cette ligne</span>`;
    else if(delta>0) deltaTxt = `<span style="color:var(--gr);font-size:11px">+${delta} (complément à envoyer)</span>`;
    else if(delta<0) deltaTxt = `<span style="color:var(--re);font-size:11px">${delta} (à ajuster manuellement dans Shopify)</span>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--b1)">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${l.nom}</div>
        ${l.variante?`<div style="font-size:11px;color:var(--t3)">${l.variante}</div>`:''}
        ${deltaTxt}
      </div>
      <div style="font-size:12px;color:var(--t3)">déjà envoyé : ${l.quantiteOriginale}</div>
      <input type="number" min="0" value="${l.quantite}" style="width:60px;padding:4px 6px;border:1px solid var(--b2);border-radius:6px;font-size:12px;text-align:center" onchange="majQuantiteModifPOLigne(${idx},this.value)">
      <div style="width:80px;text-align:right;font-size:12px;color:var(--br);font-weight:500">${fmtM(l.quantite*l.prix)}</div>
      <a href="#" onclick="retirerLigneModifPO(${idx});return false;" style="color:var(--re);font-size:11px;text-decoration:underline">retirer</a>
    </div>`;
  }).join('');
  document.getElementById('mp-total').textContent = MODIF_PO_LINES.length ? 'Total : '+fmtM(total) : '';
}

async function enregistrerModifPO(){
  if(!MODIF_PO_CTX) return;
  const {fourn, poNumber} = MODIF_PO_CTX;

  const augmentations = MODIF_PO_LINES.filter(l=>l.quantite>l.quantiteOriginale);
  const sansIdVariante = augmentations.filter(l=>!l.idVariante);
  const envoyables = augmentations.filter(l=>l.idVariante).map(l=>({idVariante:l.idVariante, quantite:l.quantite-l.quantiteOriginale, nom:l.nom, variante:l.variante, sku:l.sku}));
  const diminutions = MODIF_PO_LINES.filter(l=>l.quantite<l.quantiteOriginale);

  if(!envoyables.length && !diminutions.length && !sansIdVariante.length){ fermerModifPO(); return; }

  if(diminutions.length){
    alert('Les réductions de quantité ne sont pas encore automatisées vers Shopify (' + diminutions.map(l=>l.nom).join(', ') + '). Ajuste le transfert ' + poNumber + ' directement dans l\'admin Shopify si besoin.');
  }
  if(sansIdVariante.length){
    alert('Ces produits ne sont pas rattachés au catalogue interne, impossible de les envoyer automatiquement : ' + sansIdVariante.map(l=>l.nom).join(', ') + '. À commander manuellement dans Shopify si besoin.');
  }

  if(!envoyables.length){ fermerModifPO(); rPO(); return; }

  if(!confirm('Envoyer un complément pour ' + envoyables.length + ' produit(s) (suite au PO ' + poNumber + ') ?'))return;

  const btn = document.getElementById('mp-submit');
  if(btn){ btn.disabled = true; btn.textContent = 'Envoi…'; }

  try{
    const note = 'Modification du PO ' + poNumber + ' — complément suite ajustement de quantités';
    const data = await envoyerLignesAuBackend(fourn, note, envoyables.map(l=>({idVariante:l.idVariante, quantite:l.quantite})), '');

    if(data.success){
      if(!PO_ENVOYES[fourn])PO_ENVOYES[fourn]=[];
      PO_ENVOYES[fourn].push({poNumber:data.poNumber, lignes:envoyables.map(l=>({idVariante:l.idVariante,quantite:l.quantite,nom:l.nom,variante:l.variante,sku:l.sku})), date:new Date().toISOString()});
      fermerModifPO();
      rPO();
      if(confirm('Complément créé (' + data.poNumber + '). Télécharger le PDF de ce complément maintenant ?')){
        const lignesPourPDF = envoyables.map(l=>({nom:l.nom, variante:l.variante||'', sku:l.sku||'—', qte:l.quantite, prix:prixLigneManuelle({idVariante:l.idVariante,nom:l.nom})}));
        ouvrirDocumentPO(fourn, data.poNumber+' — complément au PO '+poNumber, '-', lignesPourPDF);
      }
    } else {
      alert('Erreur : ' + (data.error || 'inconnue'));
      if(btn){ btn.disabled = false; btn.textContent = 'Enregistrer les modifications'; }
    }
  } catch(err){
    alert('Erreur réseau : ' + err.message);
    if(btn){ btn.disabled = false; btn.textContent = 'Enregistrer les modifications'; }
  }
}

// ============================================================
// Commande manuelle — choix libre de fournisseur/produits/quantités
// ============================================================
let MANUAL_LINES = []; 
let DERNIERE_COMMANDE_MANUELLE = null; 

function ouvrirCommandeManuelle(){
  MANUAL_LINES = [];
  DERNIERE_COMMANDE_MANUELLE = null;
  document.getElementById('mc-fourn').value = '';
  document.getElementById('mc-search').value = '';
  document.getElementById('mc-note').value = '';
  document.getElementById('mc-date').value = '';
  document.getElementById('mc-search-results').style.display = 'none';
  document.getElementById('mc-success').style.display = 'none';
  document.getElementById('mc-fourn-list').innerHTML = FOURNISSEURS.map(f=>`<option value="${f.replace(/"/g,'&quot;')}">`).join('');
  renderLignesManuelles();
  document.getElementById('modal-cmd-overlay').style.display = 'flex';
}

function fermerCommandeManuelle(){
  document.getElementById('modal-cmd-overlay').style.display = 'none';
}

function rechercherProduitManuel(){
  const q = document.getElementById('mc-search').value.trim().toLowerCase();
  const resDiv = document.getElementById('mc-search-results');
  const fournisseur = document.getElementById('mc-fourn').value.trim();

  if(!fournisseur){
    resDiv.style.display = 'block';
    resDiv.innerHTML = '<div style="padding:10px;color:var(--t3);font-size:12px">Choisis d\'abord un fournisseur ci-dessus</div>';
    return;
  }
  if(!q){ resDiv.style.display = 'none'; resDiv.innerHTML=''; return; }

  const dejaAjoutes = new Set(MANUAL_LINES.map(l=>l.idVariante));
  const matches = PRODS.filter(p =>
    p.idVariante && !dejaAjoutes.has(p.idVariante) && p.fourn===fournisseur && p.nom.toLowerCase().includes(q)
  ).slice(0, 8);

  if(!matches.length){
    resDiv.style.display = 'block';
    resDiv.innerHTML = '<div style="padding:10px;color:var(--t3);font-size:12px">Aucun résultat pour ce fournisseur</div>';
    return;
  }

  resDiv.style.display = 'block';
  resDiv.innerHTML = matches.map(p => `
    <div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--b1);font-size:12px" onclick="ajouterLigneManuelle('${p.idVariante}')">
      <div style="font-weight:500">${p.nom}</div>
      ${p.variante ? `<div style="color:var(--t3);font-size:11px">${p.variante}</div>` : ''}
    </div>
  `).join('');
}

function ajouterLigneManuelle(idVariante){
  const p = PRODS.find(x => x.idVariante === idVariante);
  if(!p) return;
  MANUAL_LINES.push({ idVariante: p.idVariante, nom: p.nom, variante: p.variante || '', quantite: 1 });
  document.getElementById('mc-search').value = '';
  document.getElementById('mc-search-results').style.display = 'none';
  renderLignesManuelles();
}

function retirerLigneManuelle(idx){
  MANUAL_LINES.splice(idx, 1);
  renderLignesManuelles();
}

function majQuantiteManuelle(idx, val){
  MANUAL_LINES[idx].quantite = Math.max(0, parseInt(val) || 0);
  majTotalManuel();
}

function prixLigneManuelle(l){
  // 🚀 FIXED: Now safely uses COUT_MAP
  return (COUT_MAP[l.idVariante]||0)||COUT_MAP[normKey(l.nom)]||(PRIX_FALLBACK_ID[l.idVariante]||0);
}

function majTotalManuel(){
  const total = MANUAL_LINES.reduce((s,l)=>s+(l.quantite*prixLigneManuelle(l)),0);
  const totalEl = document.getElementById('mc-total');
  if(totalEl) totalEl.textContent = MANUAL_LINES.length ? 'Total : '+fmtM(total) : '';
}

function renderLignesManuelles(){
  const cont = document.getElementById('mc-lignes');
  if(!MANUAL_LINES.length){
    cont.innerHTML = '<div style="text-align:center;padding:16px;color:var(--t3);font-size:12px;border:1px dashed var(--b1);border-radius:8px">Aucun produit ajouté</div>';
    majTotalManuel();
    return;
  }
  cont.innerHTML = MANUAL_LINES.map((l, idx) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--b1)">
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500">${l.nom}</div>
        ${l.variante ? `<div style="font-size:11px;color:var(--t3)">${l.variante}</div>` : ''}
      </div>
      <span style="font-size:11px;color:var(--t3);min-width:60px;text-align:right">${prixLigneManuelle(l)?fmtM(prixLigneManuelle(l)*l.quantite):'—'}</span>
      <input type="number" min="0" value="${l.quantite}" oninput="majQuantiteManuelle(${idx},this.value)" style="width:60px;padding:4px 6px;border:1px solid var(--b2);border-radius:6px;font-size:12px">
      <button class="rbtn" onclick="retirerLigneManuelle(${idx})" style="padding:3px 8px">✕</button>
    </div>
  `).join('');
  majTotalManuel();
}

function genererPDFCommandeManuelle(){
  if(!DERNIERE_COMMANDE_MANUELLE){ alert('Aucune commande à imprimer.'); return; }
  const c = DERNIERE_COMMANDE_MANUELLE;
  ouvrirDocumentPO(c.fourn, c.poNumber, c.dateLivraison, c.lignes);
}

async function envoyerCommandeManuelle(){
  const fournisseur = document.getElementById('mc-fourn').value.trim();
  const note = document.getElementById('mc-note').value.trim();
  const dateLivraison = document.getElementById('mc-date').value;

  if(!fournisseur){ alert('Le fournisseur est requis.'); return; }
  if(!MANUAL_LINES.length){ alert('Ajoute au moins un produit.'); return; }

  const lignes = MANUAL_LINES
    .filter(l => l.quantite > 0)
    .map(l => ({ idVariante: l.idVariante, quantite: l.quantite }));

  if(!lignes.length){ alert('Toutes les quantités sont à 0.'); return; }

  const btn = document.getElementById('mc-submit');
  btn.disabled = true;
  btn.textContent = 'Envoi…';

  try {
    const resp = await fetch(URL_AS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fournisseur, note, dateLivraison, lignes })
    });

    const data = await resp.json();

    if(data.success){
      DERNIERE_COMMANDE_MANUELLE = {
        fourn: fournisseur,
        poNumber: data.poNumber,
        dateLivraison: dateLivraison
          ? new Date(dateLivraison+'T00:00:00').toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'})
          : '-',
        lignes: MANUAL_LINES.filter(l=>l.quantite>0).map(l=>({
          nom:l.nom, variante:l.variante||'', sku:(PRODS.find(x=>x.idVariante===l.idVariante)||{}).skuFourn||'—',
          qte:l.quantite, prix:prixLigneManuelle(l)
        }))
      };
      const successText = document.getElementById('mc-success-text');
      if(successText) successText.textContent = '✓ Commande créée : ' + data.poNumber + (data.dateAvertissement ? ' — ' + data.dateAvertissement : '');
      const successZone = document.getElementById('mc-success');
      if(successZone) successZone.style.display = 'flex';
      MANUAL_LINES = [];
      renderLignesManuelles();
    } else {
      let msg = 'Erreur : ' + (data.error || 'inconnue');
      if(data.lignesIgnorees && data.lignesIgnorees.length > 0){
        msg += '\n\nID(s) variante en cause : ' + data.lignesIgnorees.join(', ');
      }
      alert(msg);
    }

  } catch(err){
    alert('Erreur réseau : ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Créer la commande';
  }
}

// IGNITION: Starts the entire process when the file is loaded
loadData();
