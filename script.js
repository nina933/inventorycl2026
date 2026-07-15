
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
let PRODS=[],ETAT=[],STOCKY=[],RECEPTIONS=[],PREVISION=[],PROMOS=[],BUDGET=[],PRIX_MAP={},DELAIS_MAP={},FORECAST=[];

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

// SORTS is the memory for the table headers. It remembers which column is clicked 
// for every single tab. 'dir: 1' means sorting lowest-to-highest (A-Z). 'dir: -1' means highest-to-lowest.
// (e.g., 'a' = Alertes tab, 's' = Stocks tab, 'v' = Ventes tab).
// Add d:{col:'capital',dir:-1} to the end of this list
let SORTS={a:{col:'stock',dir:1},
  s:{col:'stock',dir:1},
  f:{col:'pareto',dir:1},
  v:{col:'vt',dir:-1},
  e:{col:'nom',dir:1},
  fc:{col:'nom',dir:1},
  pr:{col:'nom',dir:1}, 
  d:{col:'capital',dir:-1}};
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

  // Create a 30-second countdown timer
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60000 milliseconds = 60 seconds

  try {
    // 2. THE FETCH: The app literally "calls" the Google Sheet URL and asks for the data.
    setMsg('Chargement des données en live. Attendez un instant...');
    const resp=await fetch(URL_AS, { signal: controller.signal });

    // If it succeeds before 60 seconds, we clear the timer so it doesn't trigger anyway
    clearTimeout(timeoutId);

    // If the internet is down or the link is broken, throw a red error flag.
    if(!resp.ok)
      throw new Error('Erreur réseau: '+resp.status);

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
    DELAIS_MAP={}; (raw['Delais de livraison']||[]).slice(1).forEach(r=>{ const fourn=String(r[0]||'').trim(); const delai=parseFloat(r[1]||0)||0; if(fourn)DELAIS_MAP[fourn]=delai; });
    
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
      const com=String(r[10]||'').trim(); if(nom&&com)COMMENTS_MAP[nom]=com; 
    });

    // Pareto Rankings (ABC)
    // Looks up a Product Name (Column 2) and saves its ranking category (A, B, or C from Column 8).
    ABC_MAP={};
    (raw['ABC']||[]).slice(1).forEach(r=>{ 
      const nom=String(r[1]||'').trim(); 
      if(nom)ABC_MAP[nom]=String(r[7]||'C').trim(); 
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
    COUT_MAP = {};
    PRIX_MAP = {}; 
    
    // 🚀 THE FIX: Search for the tab ignoring capital letters!
    const nomOngletPrix = Object.keys(raw).find(k => k.toLowerCase() === 'prix produits');
    const prixRows = raw[nomOngletPrix] || [];

    prixRows.slice(1).forEach(r => {
      // 🚀 HARDCODED TO YOUR EXACT MAP:
      const id = String(r[3]||'').replace(/\D/g, ''); // Col D (Index 3) = ID
      const retail = n(r[6]);                         // Col G (Index 6) = Prix de détail
      const cost = n(r[7]);                           // Col H (Index 7) = Coût
      
      const nom = String(r[1]||'').trim();            // Col B = Produit
      const fullNom = String(r[0]||'').trim();        // Col A = Produit + Variante
      
      // 1. Save by Pure ID (Primary Target for Simulation)
      if (id) {
          if (cost > 0) COUT_MAP[id] = cost;
          if (retail > 0) PRIX_MAP[id] = retail;
      }
      
      // 2. Save by Names (Double-Security Backup)
      if (nom) {
          if (cost > 0) COUT_MAP[nom] = cost;
          if (retail > 0) PRIX_MAP[nom] = retail;
      }
      if (fullNom) {
          if (cost > 0) COUT_MAP[fullNom] = cost;
          if (retail > 0) PRIX_MAP[fullNom] = retail;
      }
    });

    // Capture N-1 Sales (Historical) - NOW USING IDs!
    // Capture N-1 Sales (Historical) - 🚀 STRICT PURE ID LOGIC
    VN1_MAP = {};
    const VN1_MONTHLY_MAP = {}; 
    
    (raw['Ventes N-1']||[]).slice(1).forEach(r=>{
      // Strips all hidden characters, keeping only numbers
      const id = String(r[3]||'').replace(/\D/g, ''); 
      if(!id) return;
      
      let total=0;
      let months = []; 
      for(let i=4;i<=15;i++){
          let m_val = n(r[i]);
          total += m_val;
          months.push(m_val);
      }
      
      if(total===0) return;
      VN1_MAP[id] = (VN1_MAP[id]||0) + total;
      VN1_MONTHLY_MAP[id] = months; 
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
    FORECAST=pT(raw['Forecast automatisé']||[]).filter(r=>r['Titre du produit avec variants']||r['Produit']).map(r=>({
      nom:String(r['Titre du produit avec variants']||r['Produit']||'').trim(),
      fourn:String(r['Fournisseur']||'').trim(),
      // Uses the ABC phonebook we built earlier to assign the Pareto ranking
      cat:ABC_MAP[String(r['Titre du produit avec variants']||r['Produit']||'').trim()]||String(r['Pareto']||r['Catégorie']||'').trim(),
      M01:n(r['M01']),M02:n(r['M02']),M03:n(r['M03']),M04:n(r['M04']),M05:n(r['M05']),M06:n(r['M06']),
      M07:n(r['M07']),M08:n(r['M08']),M09:n(r['M09']),M10:n(r['M10']),M11:n(r['M11']),M12:n(r['M12'])
    }));



// =================================================================
    // 3D. Current Sales & Inventory
    // =================================================================

    // -----------------------------------------------------------------
    // STEP 1: Process Current Year's Sales (Ventes N)
    // -----------------------------------------------------------------
    const CW = cw(); // Get the current week of the year (e.g., Week 15)
    const vMap = {}; // A temporary phonebook to store sales data before attaching it to inventory

    // Col D (Index 3) = ID, Col E (Index 4) = S01
    (raw['Ventes N']||[]).slice(1).forEach(r=>{
      // QUALITY CONTROL: Just like in N-1, if the product lacks an ID, skip it.
      // This automatically removes non-retail noise like gift cards, services, or internal transfers. 

      // Grab the ID strictly by its column position (Column D = Index 3)
      const id = String(r[3]||'').replace(/\D/g, '');
      if(!id) return; 

      let total=0, nz=0, curV=0;
      const sems={}; 

      for(let i=1; i<=53; i++){
        const weekKey = 'S' + String(i).padStart(2,'0'); 
        const colIndex = i + 3; // i=1 -> Index 4 (Col E)
        
        const v = n(r[colIndex]); 
        sems[weekKey] = v;
        total += v;
        if (v > 0) nz++;
        if (i === CW) curV = v;
      }
      
      vMap[id] = {
        total, 
        moy: nz > 0 ? Math.round(total/nz*10)/10 : 0, 
        curV, 
        sems,
        fourn: String(r[1]||'').trim(), // Col B
        var_: String(r[2]||'').trim()   // Col C
      };
    });

    // -----------------------------------------------------------------
    // STEP 2: Build the Master Inventory List (PRODS)
    // -----------------------------------------------------------------
    // This is the most important array in the app. Almost every tab uses `PRODS`.
    
    const sRows=raw['Stock produits']||[];
    const seen = new Set(); // A tool to prevent counting the same product twice
    PRODS = [];             // Empty the master bucket before refilling it
    
    sRows.slice(1).forEach(r=>{
      const combinedName = String(r[1]||'').trim(); // Col B: Full Name + Variant
      if(!combinedName||combinedName==='Clé produit'||combinedName.startsWith('Dernière')||combinedName.startsWith('Actualisation'))
        return;
      
      // EXPLICIT EXCLUSION FILTER: Ignore Bundle, Return, Demo, Open Box
      const lowerName = combinedName.toLowerCase();
      if(lowerName.includes('bundle') || lowerName.includes('return') || lowerName.includes('demo') || lowerName.includes('open box') || lowerName.includes('refurbished') || lowerName.includes('à vendre en boutique'))
        return;
      
      // THE NEW MATCHER: Grab Col E (Index 4) for the Variant ID
      const idVariante = String(r[4]||'').replace(/\D/g, '');
      
      // FETCH SALES using the ID!      const vd = vMap[idVariante] || {};
      const vd = vMap[idVariante] || {};
      const vn1 = VN1_MAP[idVariante] || 0;
      const vn1_months_array = VN1_MONTHLY_MAP[idVariante] || [0,0,0,0,0,0,0,0,0,0,0,0];
      
      // Extract basic physical details from the sheet
      const nom=String(r[2]||'').trim().replace(/\s*\|\s*$/,''); // Col C: Product Name
      const variante=String(r[3]||'').trim();                   // Col D: Variant Name
      const stock=n(r[7]);                                      // Physical units in the warehouse (H)
      const fourn=String(r[8]||'').trim();                      // Supplier Name
      const statR=String(r[9]||'').toLowerCase().trim();        // Status (Active/Archived)
      const en_cmd=n(r[13]||0);                                 // Units currently on order/in transit
      const pc=String(r[15]||'').trim();                        // Pareto classification
              
      // DEDUPLICATION: Ensure we don't add the exact same variant twice
      const dedupeKey=combinedName+'|'+idVariante;
      if(seen.has(dedupeKey))
        return; seen.add(dedupeKey);
      
      // Assign Pareto (A/B/C) and fetch Forecast data
      const pareto=(['A','B','C'].includes(pc)?pc:(ABC_MAP[nom]||'C'));
      const fc=fcMap[nom]||{};
      
      // FORECAST MATH: Calculate weeks of inventory left based on upcoming forecasted demand
      const moisLabels=['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];
      const moisCourantKey=moisLabels[new Date().getMonth()];
      const fc_cur=fc[moisCourantKey]||0;                     // This month's forecast

      // Calculate average weekly demand (forecast / 4.33 weeks in a month) or fallback to past averages
      const wkfc=fc_cur>0?fc_cur/4.33:(vd.moy||0);
      const wks_left=wkfc>0?Math.round(stock/wkfc):null;
      const statut_produit=statR||'active';

      // How many weeks the supplier takes to deliver
      const delai_fourn=DELAIS_MAP[fourn]||0;
      const semCourante=CW;
      
      // CALCULATE "DEMANDE CUMULÉE": How many units will we sell *while* waiting for a delivery?
      let demandeCumulee=0;
      for(let s=0;s<Math.max(delai_fourn,1);s++){
        const sem=semCourante+s;
        const moisIdx=Math.min(11,Math.floor(((sem-1)/52.18)*12));
        const moisKey=moisLabels[moisIdx];
        const fcMois=fc[moisKey]||0;
        demandeCumulee+=fcMois>0?fcMois/4.33:0;      
      }
      
      // ASSIGN STATUS ALERTS (Critique / Rupture)
      let statut;
      if(stock<0) statut='rupture'; // Out of stock
      // If our current stock + what's in transit isn't enough to survive the delivery wait time:
      else if((stock+en_cmd)<demandeCumulee&&demandeCumulee>0) statut='critique';
      else statut='active';
      
      // Fetch cost data using our phonebooks 
      // (Historical N-1 data has been intentionally disabled)
      const cout_unitaire = COUT_MAP[nom] || 0;

      // ASSEMBLE THE PRODUCT: Push all this data into one massive, organized package 
      // inside the master PRODS bucket.
      PRODS.push({
          nom, 
          nb: combinedName, 
          id: idVariante, // IMPORTANT
          variante:variante==='Default Title'?'':variante, 
          fourn, statut, statut_produit, stock, pareto, 
          cout: cout_unitaire, 
          vn1_months: vn1_months_array, 
          en_cmd, fc_m05:fc_cur, wks_left, demande_cumulee: demandeCumulee, 
          vt:vd.total||0, vm:vd.moy||0, vc:vd.curV||0, sems:vd.sems||{}, vn1: vn1 // Hardcoded to 0
      });
    });

    // -----------------------------------------------------------------
    // STEP 3: Process "État des stocks" (Stock Status Simulator)
    // -----------------------------------------------------------------
    // Reads a specific tab forecasting weekly stock levels and groups it into a clean list.

    ETAT=pT(raw['Etat des stocks']||[]).filter(r=>r['Nom produit']&&!String(r['Nom produit']).startsWith('Dernière')).map(r=>{
      const nom=String(r['Nom produit']||'').trim();
      const variante=String(r['Variante']||'').trim();
      const sems={};
      // Build a mini-bucket of predicted stock levels for 52 weeks
      for(let i=1;i<=52;i++)sems['S'+String(i).padStart(2,'0')]=n(r['Semaine '+i]);

      return{
        nom,
        variante:variante==='Default Title'?'':variante,
        fourn:String(r['Fournisseur']||''),
        cat:ABC_MAP[nom]||String(r['Catégorie']||'C').trim(),
        sems};
    });

    // =================================================================
    // 3E. PURCHASING, LOGISTICS & MARKETING
    // =================================================================

    // -----------------------------------------------------------------
    // PURCHASE ORDERS (Stocky Orders)
    // -----------------------------------------------------------------
    // The Google Sheet lists every single product on its own row. 
    // This code groups them together by their "PO Number" so we can look at 
    // whole orders (like a shopping cart) rather than scattered items.
    const byCmd={};
    pT(raw['Stocky Orders']||[]).forEach(r=>{
      const cmd=String(r['Nom du PO']||r['Numéro de la commande']||'').trim();
      const nom=String(r['Nom du produit']||r['Produit']||'').trim();
      if(!cmd||!nom||cmd.startsWith('Dernière')||cmd.startsWith('Actualisation'))
        return;

      // If we haven't seen this PO number yet, create a new "Shopping Cart" for it
      if(!byCmd[cmd]) 
        byCmd[cmd]={cmd,fourn:String(r['Nom du fournisseur']||'').trim(),
        livraison:fmtD(r['Délai estimé de livraison']),
        date_cmd:fmtD(r['Date de commande']),
        lignes:[], // This bucket will hold the individual products
        total:0};

      // Put the product into the shopping cart and add to the total quantity   
      const qty=n(r['Quantité']||1);
      const com=fmtD(r['Nouvelle date de livraison']||'')==='—'?'':fmtD(r['Nouvelle date de livraison']||'');

      byCmd[cmd].lignes.push({nom,variante:String(r['Nom du variant']||''),qty,livraison:fmtD(r['Délai estimé de livraison']),com});
      byCmd[cmd].total+=qty;
    });

    // Convert the phonebook of shopping carts into a flat list, sorted by PO number (newest first)
    STOCKY=Object.values(byCmd).filter(c=>c.lignes.length>0).sort((a,b)=>b.cmd-a.cmd);

    // -----------------------------------------------------------------
    // INCOMING SHIPMENTS (Réceptions par semaine)
    // -----------------------------------------------------------------
    // Reads a timeline of when products are physically expected to arrive.
    RECEPTIONS=pT(raw['Réception des commandes']||[]).filter(r=>{
      const nom=String(r['Nom produit']||'').trim();
      if(!nom||nom.startsWith('Dernière'))
        return false;

      // Only keep the product if it has units arriving from "Last Week" all the way to Week 52. 
      // If nothing is arriving, we throw the row away to keep the app fast.
      for(let i=CW-1;i<=52;i++){if(n(r['Semaine '+i])>0)
        return true;}
      return false;
    }).map(r=>{
      const nom=String(r['Nom produit']||'').trim();
      const sems={};for(let i=1;i<=52;i++)sems[i]=n(r['Semaine '+i]);
      return{nom,fourn:String(r['Fournisseur']||''),cat:ABC_MAP[nom]||String(r['Catégorie']||'C'),sems};
    });

    // -----------------------------------------------------------------
    // PLANNED PURCHASES (Prévision commandes)
    // -----------------------------------------------------------------
    // What we *plan* to buy (not yet ordered).
    PREVISION=pT(raw['Prevision commandes']||[]).filter(r=>{
      const nom=String(r['Nom produit']||'').trim();
      return nom&&!nom.startsWith('Dernière');
    }).map(r=>{
      const nom=String(r['Nom produit']||'').trim();
      const sems={};for(let i=1;i<=52;i++)sems[i]=n(r['Semaine '+i]);

      // We use our clean fingerprint to look up its sales velocity from the Ventes phonebook
      const vdp=vMap[normalize(nom)]||{};
      return{
        nom,
        fourn:String(r['Fournisseur']||''),
        cat:ABC_MAP[nom]||String(r['Catégorie']||'C'),
        delai:n(r['Délai livraison']),
        tc:n(r['TOTAL commandes']),tf:n(r['Total forecast']),ts:n(r['Total stock']),
        prix:PRIX_MAP[nom]||0,vm:vdp.moy||0,sems};
    });

    // -----------------------------------------------------------------
    // MARKETING (Promos)
    // -----------------------------------------------------------------
    PROMOS=pT(raw['Promos']||[]).filter(r=>r['Produit']).map(r=>({
      produit:String(r['Produit']||''),marque:String(r['Marque']||''),
      dd:fmtD(r['Date Début']),df:fmtD(r['Date Fin']), // Clean the dates
      sd:n(r['Sem. Début (ISO)']),sf:n(r['Sem. Fin (ISO)']), // The exact weeks the promo runs
      boost:n(String(r['Boost%']||'0').replace('%','')) // How much it boosts sales
    }));

    // -----------------------------------------------------------------
    // FINANCIAL CALCULATOR (Budget)
    // -----------------------------------------------------------------
    // This creates 52 buckets (one for each week of the year). 
    // It looks at our Planned Purchases (Prévision) and multiplies the units we 
    // need to buy by their cost, telling us exactly how much money we will spend each week.
    BUDGET=[];
    for(let i=1;i<=52;i++){
      const val=PREVISION.reduce((s,r)=>s+(r.sems[i]||0)*(r.prix||0),0);
      BUDGET.push({label:'Semaine '+i,val:Math.round(val),sn:i});
    }

    // Creates the master list of all suppliers, removing duplicates and alphabetizing them
    FOURNISSEURS=[...new Set(PRODS.map(p=>p.fourn).filter(Boolean))].sort();

    // =================================================================
    // 3F. DASHBOARD POLISH & LAUNCH
    // =================================================================
    const W = cw(); // Get current week

    // Update the text at the very top of the screen (Last updated time, current week)
    document.getElementById('tinfo').textContent=`Google Sheets · Live · S${W} · ${new Date().toLocaleDateString('fr-CA')}`;
    document.getElementById('tupd').textContent='MAJ '+new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});

    // Update the little notification bubbles in the sidebar menu
    document.getElementById('nb-r').textContent=STOCKY.filter(c=>!c.recu).length||'';
    const crit=PRODS.filter(p=>p.statut==='critique').length;
    document.getElementById('nb-p').textContent=PROMOS.filter(p=>p.sd<=W&&p.sf>=W).length||'';

    // Tell the app to build the dropdown menus now that we have all the suppliers
    populateFiltres();

    // Change the "Forecast" column headers to say the actual current month (e.g., "Forecast Juin")
    const moisNoms=['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];
    const moisCourantLabel=moisNoms[new Date().getMonth()];
    document.querySelectorAll('[id^="th-fc"]').forEach(el=>el.textContent='Forecast '+moisCourantLabel);

    // THE LAUNCH: Hide the white loading screen and draw the currently selected tab!
    document.getElementById('lov').style.display='none';

    renderView(CV); 
  } catch(e) {
    // If the error was caused by our 60-second timer
    if (e.name === 'AbortError') {
        showVisualError("Google Sheets met trop de temps à répondre (Timeout de 60s). Le fichier est peut-être trop lourd actuellement.");
    } else {
        // For any other loading error
        showVisualError(e.message);
    }
    console.error(e);
  }
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

  const swpo=document.getElementById('sw-po');
  if(swpo)swpo.innerHTML=swOpts.join('');

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
  if(v==='alertes')rAlertes();else if(v==='stocks')rStocks();
  else if(v==='fournisseurs')rFourn();else if(v==='ventes')rVentes();
  else if(v==='etat')rEtat();else if(v==='receptions')rReceptions();
  else if(v==='planrec')rPlanRec();else if(v==='po')rPO();else if(v==='budget')rBudget();else if(v==='promos')rPromos();
  else if(v==='dormant')rDormant();
}

function srt(tbl,col,el){
  const s=SORTS[tbl];
  // ADD d:'dormant' to the end of this map:
  const viewMap={a:'alertes',s:'stocks',f:'fournisseurs',v:'ventes',e:'etat',fc:'forecast',pr:'promos', d:'dormant'};
  const scope=tbl==='f'?document.getElementById('fc'):document.getElementById('v-'+(viewMap[tbl]||tbl));
  scope?.querySelectorAll('th').forEach(t=>{t.classList.remove('asc','desc');});
  if(s.col===col)s.dir*=-1;else{s.col=col;s.dir=1;}
  el.classList.add(s.dir===1?'asc':'desc');
  
  // ADD  else if(tbl==='d')rDormant();  to the end of this line:
  if(tbl==='a')
    rAlertes();
  else if(tbl==='s')rStocks();
  else if(tbl==='f')rFourn();
  else if(tbl==='v')rVentes();
  else if(tbl==='e')rEtat();
  else if(tbl==='fc')rForecast();
  else if(tbl==='pr')rPromos();
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

// 4. ETAT DES STOCKS TAB (Future Stock Heatmap)
function rEtat(){
  const W=cw();
  const srch=(document.getElementById('s-e')?.value||'').toLowerCase();
  const fourns=gC('fe'),pars=gC('pe');
  const rowsE=ETAT.filter(r=>{
    if(!equipeMatch(r.fourn))
      return false;
    if(fourns.length&&!fourns.includes(r.fourn))
      return false;
    if(pars.length&&!pars.includes(r.cat))
      return false;
    if(srch&&!r.nom.toLowerCase().includes(srch))
      return false;
    return true;
  });
  const rows=sortProds(rowsE,SORTS.e.col,SORTS.e.dir);
  document.getElementById('rc-e').textContent=rows.length+' produit(s)';
  if(!rows.length){document.getElementById('th-e').innerHTML='';document.getElementById('tb-e').innerHTML='<tr><td style="text-align:center;padding:40px;color:var(--t3)">Aucune donnée</td></tr>';return;}
  
  // Calculate the next 12 weeks to generate the dynamic headers
  const wks=[];
  for(let i=W;i<=Math.min(52,W+11);i++)wks.push('S'+String(i).padStart(2,'0'));
  document.getElementById('th-e').innerHTML=`<tr><th onclick="srt('e','nom',this)">Produit</th><th onclick="srt('e','fourn',this)">Fourn.</th><th onclick="srt('e','cat',this)">Cat.</th>${wks.map(k=>`<th style="text-align:center">${k}</th>`).join('')}</tr>`;
  document.getElementById('tb-e').innerHTML=rows.map(r=>`<tr>
    <td><div class="pn">${r.nom}</div>${r.variante?`<div class="pv">${r.variante}</div>`:''}</td>
    <td style="font-size:12px;color:var(--t2);white-space:nowrap">${r.fourn||'—'}</td>
    <td>${bP(r.cat)}</td>
    ${wks.map(k=>{
      const v=r.sems[k]||0;
      const bg=v<=0?'var(--reb)':v<=5?'var(--amb)':'var(--grb)';
      const col=v<=0?'var(--re)':v<=5?'var(--am)':'var(--gr)';
      return`<td style="text-align:center;background:${bg};color:${col};font-weight:500;font-size:12px;padding:8px 10px">${fmt(v)}</td>`;
    }).join('')}
  </tr>`).join('');
}

// -----------------------------------------------------------------
// 5. INCOMING SHIPMENTS (Confirmed POs - rReceptions)
// -----------------------------------------------------------------
// This tab tracks the physical boxes that are currently on trucks or boats. 
// It groups them by Purchase Order (PO) number so the warehouse team knows exactly what is arriving.

function rReceptions(){
  const srch=(document.getElementById('s-r')?.value||'').toLowerCase();
  const fourn=document.getElementById('f-r')?.value||'';
  const sw=document.getElementById('sw-r')?.value||'';
  const W=cw();
  
  // Filter the Stocky (Confirmed POs) list based on user search and dropdowns
  let sf=STOCKY.filter(c=>{
    if(!equipeMatch(c.fourn)) 
      return false;
    if(fourn&&c.fourn!==fourn) 
      return false;
    
    // Check if the search bar text matches ANY product inside this specific PO
    if(srch&&!c.lignes.some(l=>l.nom.toLowerCase().includes(srch))) 
      return false;
    
    // Filter by the expected arrival week
    if(sw){
      if(c.livraison&&c.livraison!=='—'){
        try{
          const d=new Date(c.livraison.split('/').reverse().join('-'));
          const s=new Date(d.getFullYear(),0,1);
          const cmdSw=Math.ceil(((d-s)/86400000+s.getDay()+1)/7);
          if(cmdSw!==parseInt(sw)) 
            return false;
        }catch(e){

        }
      }
    }
    return true;
  });
  
  document.getElementById('rc-r2').textContent=sf.length+' commande(s)';
  let html='';
  
  // Draw the accordion-style dropdowns for each Purchase Order
  if(sf.length){
    html+=`<div class="sh"><span class="st">Commandes Stocky (${sf.length})</span></div>`;
    html+=sf.map((c,i)=>`
      <div class="rg">
        <div class="rh" onclick="toggleRec('rb${i}','arr${i}')">
          <span class="rh-cmd">PO #${c.cmd}</span>
          <span class="rh-f">${c.fourn}</span>
          <span class="rh-d">📅 ${c.livraison}</span>
          <span class="rh-cnt">${c.lignes.length} produit(s) · ${fmt(c.total)} unités <span id="arr${i}">▼</span></span>
        </div>
        <div class="rb" id="rb${i}">
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
      </div>`).join('');
  }
  if(!html)html='<div style="text-align:center;padding:50px;color:var(--t3)">Aucune réception en cours</div>';
  document.getElementById('rc-cont').innerHTML=html;
}



// -----------------------------------------------------------------
// 6. PLANNED RECEPTIONS (Forecast vs Reality - rPlanRec)
// -----------------------------------------------------------------
// This function compares what we *planned* to receive against the 
// *actual* Purchase Orders we placed. It acts as an audit to catch missing orders.

function rPlanRec(){
  const fourn=document.getElementById('f-pr2')?.value||'';
  const par=document.getElementById('p-pr2')?.value||'';
  const stat=document.getElementById('st-pr2')?.value||'';
  const sw=document.getElementById('sw-pr2')?.value||'';
  const W=cw();
  
  let rf=RECEPTIONS.filter(r=>{
    if(!equipeMatch(r.fourn)) 
      return false;
    if(fourn&&r.fourn!==fourn) 
      return false;
    if(par&&r.cat!==par) 
      return false;
    
    // Check product health status
    const prod=PRODS.find(p=>p.nom===r.nom);
    if(stat==='rupture_critique'&&prod?.statut!=='rupture'&&prod?.statut!=='critique') 
      return false;
    else if(stat==='rupture'&&prod?.statut!=='rupture') 
      return false;
    else if(stat==='critique'&&prod?.statut!=='critique') 
      return false;
    else if(stat==='active'&&prod?.statut!=='active') 
      return false;
    return true;
  });
  
  document.getElementById('rc-pr2').textContent=rf.length+' produit(s)';
  if(!rf.length){document.getElementById('planrec-cont').innerHTML='<div style="text-align:center;padding:50px;color:var(--t3)">Aucune réception planifiée</div>';return;}
  
  const swFrom=sw?parseInt(sw):Math.max(1,W-1);
  const wks=[];for(let i=swFrom;i<=Math.min(52,swFrom+11);i++)wks.push(i);
  
  const html2=`<div class="tw" style="overflow-x:auto"><table>
    <thead><tr><th>Produit</th><th>Fournisseur</th><th>Cat.</th>
    ${wks.map(i=>`<th style="text-align:center">S${String(i).padStart(2,'0')}</th>`).join('')}</tr></thead>
    <tbody>${rf.map(r=>`<tr>
      <td><div class="pn">${r.nom}</div></td>
      <td style="font-size:12px;white-space:nowrap">${r.fourn||'—'}</td>
      <td>${bP(r.cat)}</td>
      ${wks.map(i=>{
        const v=r.sems[i]||0;
        if(v>0){
          // THE AUDITOR: Check if an actual PO exists for this planned delivery
          const isoWeekToDate=(yr,wk)=>{
            const jan4=new Date(yr,0,4);
            const day=jan4.getDay()||7;
            const monday=new Date(jan4);monday.setDate(jan4.getDate()-day+1+(wk-1)*7);
          return monday;};
          const yr=new Date().getFullYear();
          const wkStart=isoWeekToDate(yr,i);
          const wkEnd=new Date(wkStart);wkEnd.setDate(wkStart.getDate()+6);
          
          // Look for a matching PO in the Stocky list
          const matchingPO=STOCKY.flatMap(c=>c.lignes).filter(l=>{
            if(l.nom!==r.nom) 
              return false;
            if(!l.livraison||l.livraison==='—') 
              return false;
            let d;
            if(l.livraison.includes('/')){const p=l.livraison.split('/');d=new Date(p[2],p[1]-1,p[0]);}
            else d=new Date(l.livraison);
            return d>=wkStart&&d<=wkEnd;
          });
          
          const hasPO=matchingPO.length>0;
          const qtyMatch=hasPO&&matchingPO.some(l=>l.qty===v);
          
          // Color coding: Red = Missing PO, Yellow = Quantities don't match, Blue = Perfect match
          const bg=!hasPO?'var(--reb)':qtyMatch?'var(--blb)':'#FFF3CD';
          const col=!hasPO?'var(--re)':qtyMatch?'var(--bl)':'#856404';
          const title=!hasPO?'⚠️ Aucun PO Stocky':qtyMatch?'✅ PO correspondant':'⚠️ Quantité différente';
          return `<td style="text-align:center;background:${bg};color:${col};font-weight:600;font-size:12px;padding:8px 10px" title="${title}">${fmt(v)}</td>`;
        }
        return `<td style="text-align:center;color:var(--t3)">—</td>`;
      }).join('')}
    </tr>`).join('')}</tbody>
  </table></div>`;
  document.getElementById('planrec-cont').innerHTML=html2;
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

function rPO(){
  const W=cw();
  const sw=parseInt(document.getElementById('sw-po')?.value||W);
  const fpo=document.getElementById('f-po');
  const currentFourn=fpo?.value||'';
  
  if(fpo){
    const activeFourns=[...new Set(PREVISION.filter(r=>r.sems[sw]>0&&equipeMatch(r.fourn)).map(r=>r.fourn).filter(Boolean))].sort();
    fpo.innerHTML='<option value="">Tous fournisseurs actifs S'+String(sw).padStart(2,'0')+'</option>'+activeFourns.map(f=>`<option${f===currentFourn?' selected':''}>${f}</option>`).join('');
  }
  
  const fourn=fpo?.value||'';
  const rows=PREVISION.filter(r=>{
    if(!equipeMatch(r.fourn)) 
      return false;
    if(fourn&&r.fourn!==fourn) 
      return false;
    return r.sems[sw]>0; // Only keep items that actually need to be ordered this week
  });
  
  // Calculate the total cost of all orders required this week
  const total_montant=rows.reduce((s,r)=>s+(r.sems[sw]*(r.prix||0)),0);
  document.getElementById('rc-po').textContent=rows.length+' produit(s) · '+fmtM(total_montant);
  
  // Draw the Budget Bar at the top of the screen
  const bar=document.getElementById('po-budget-bar');
  const budgetSem=BUDGET.find(b=>b.sn===sw);
  if(bar&&budgetSem&&budgetSem.val>0){
    bar.style.display='block';
    document.getElementById('po-budget-total').textContent=fmtM(budgetSem.val);
    const byF={};
    PREVISION.filter(r=>r.sems[sw]>0).forEach(r=>{
      if(!r.fourn)return;
      if(!byF[r.fourn])byF[r.fourn]=0;
      byF[r.fourn]+=r.sems[sw]*(r.prix||0);
    });
    const fList=Object.entries(byF).sort((a,b)=>b[1]-a[1]);
    const curF=fpo?.value||'';
    document.getElementById('po-budget-fourns').innerHTML=fList.map(([f,m])=>{
      const fSafe=f.replace(/'/g,"&#39;");
      const active=curF===f;
      // Creates clickable vendor badges with their total order cost
      return '<span onclick="document.getElementById(\'f-po\').value=\''+fSafe+'\';rPO();" style="cursor:pointer;padding:4px 10px;border-radius:20px;font-size:12px;background:'+(active?'var(--br)':'var(--w)')+';color:'+(active?'#fff':'var(--t2)')+';border:1px solid '+(active?'var(--br)':'var(--b1)')+'">'+f+(m>0?' · '+fmtM(m):'' )+'</span>';
    }).join('');
  } else if(bar){bar.style.display='none';}
  
  if(!rows.length){document.getElementById('po-cont').innerHTML='<div style="text-align:center;padding:50px;color:var(--t3)">Aucune prévision pour cette semaine</div>';return;}
  
  const wks=[];for(let i=sw;i<=Math.min(52,sw+5);i++)wks.push(i);
  const byF={};
  rows.forEach(r=>{if(!byF[r.fourn])byF[r.fourn]=[];byF[r.fourn].push(r);});
  let html='';
  
  // Render tables grouped by Supplier
  Object.entries(byF).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([f,prods])=>{
    const fm=prods.reduce((s,r)=>s+(r.sems[sw]*(r.prix||0)),0);
    html+=`<div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-weight:600;font-size:13px;color:var(--t1)">${f}</span>
        <span style="font-size:12px;color:var(--t3)">${prods.length} produit(s)</span>
        ${fm>0?`<span style="margin-left:auto;font-weight:500;color:var(--br)">${fmtM(fm)}</span>`:''}
      </div>
      <div class="tw"><table>
        <thead><tr><th>Produit</th><th>Cat.</th><th>Délai</th>
        ${wks.map(i=>`<th style="text-align:center">S${String(i).padStart(2,'0')}</th>`).join('')}
        <th style="text-align:right">Total cmd</th><th style="text-align:center">Sem. couvertes</th><th style="text-align:right">Prix unit.</th><th style="text-align:right">Montant</th>
        </tr></thead>
        <tbody>${prods.map(r=>`<tr>
          <td><div class="pn">${r.nom}</div>${(()=>{const p=PRODS.find(x=>x.nom===r.nom);
            return p&&p.variante?`<div class="pv">${p.variante}</div>`:''})()}</td>
          <td>${bP(r.cat)}</td>
          <td style="text-align:center;font-size:12px">${r.delai>0?r.delai+' sem.':'—'}</td>
          ${wks.map(i=>{
            const v=r.sems[i]||0;
            return v>0?`<td style="text-align:center;background:var(--amb);color:var(--am);font-weight:600;font-size:12px;padding:8px 10px">${fmt(v)}</td>`:
              `<td style="text-align:center;color:var(--t3)">—</td>`;
          }).join('')}
          <td style="text-align:right;font-weight:500">${r.tc>0?fmt(r.tc):'—'}</td>
          <td style="text-align:center">${(()=>{const qty=r.sems[sw]||0;const vm=r.vm||0;if(qty>0&&vm>0){const wksCov=Math.round(qty/vm);const ok=wksCov>=(r.delai||0);return `<span style="font-weight:600;color:${ok?'var(--gr)':'var(--re)'}">${wksCov} sem.</span>`;}return '<span style="color:var(--t3)">—</span>';})()}</td>
          <td style="text-align:right;color:var(--t2)">${r.prix>0?fmtM(r.prix):'—'}</td>
          <td style="text-align:right;font-weight:500;color:var(--br)">${r.prix>0?fmtM(r.sems[sw]*r.prix):'—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
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
  
  const swpo=document.getElementById('sw-po');
  if(swpo){
    for(let i=0;i<swpo.options;i++){
      if(parseInt(swpo.options[i].value)===sw){swpo.selectedIndex=i; 
        break;}
    }
  }
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
    return`<tr>
      <td><div class="pn">${r.produit}</div></td>
      <td style="white-space:nowrap">${r.marque}</td>
      <td>${badge}</td>
      <td style="white-space:nowrap;font-size:12px">S${String(r.sd).padStart(2,'0')}–S${String(r.sf).padStart(2,'0')}</td>
      <td style="font-size:12px">${r.dd}</td>
      <td style="font-size:12px">${r.df}</td>
      <td style="text-align:right;font-weight:600;color:${r.boost>=30?'var(--gr)':r.boost>=15?'var(--am)':'var(--t1)'}">${r.boost>0?r.boost+'%':'—'}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--t3)">Aucune promo</td></tr>';
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
    sta:'Statut',sts:'Statut',stf:'Statut'}[name]||name;
  btn.textContent=ch.length?lbl+' ('+ch.length+')':lbl;
  btn.classList.toggle('on',ch.length>0);
}

// If you click anywhere outside the dropdown menu, close it
document.addEventListener('click',e=>{
  if(!e.target.closest('.dd')&&!e.target.closest('.dd-panel'))document.querySelectorAll('.dd-panel.open').forEach(p=>p.classList.remove('open'));
});

// Builds the custom multi-select checkboxes for all tabs (including Dormant Stock)
function populateFournDD(){
  [['ddl-fa','fa','rAlertes','dd-fa'],['ddl-fs','fs','rStocks','dd-fs'],
   ['ddl-fv','fv','rVentes','dd-fv'],['ddl-fe','fe','rEtat','dd-fe'],
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
            lowerName.includes("new wave - coffee beans") ||
            lowerName.includes("hoodies") ||
            lowerName.includes("gift card");

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

    // FALLBACK LOGIC: If forecast is 0 or missing
    if (demandCeiling <= 0) {
        const historicalWeeklyAverage = targetProd.vm || 0;
        if (historicalWeeklyAverage > 0) {
            demandCeiling = Math.round(historicalWeeklyAverage * 16); // 16 weeks ~ 4 months
            demandSourceLabel = `Moyenne historique (16 sem.)`;
        } else {
            demandCeiling = 10; // Absolute safety net for a Pareto A item
            demandSourceLabel = `Minimum de sécurité Tier A`;
        }
    }

    // 5. Math Step 3: Constraint Logic (Pick the lower number to be safe)
    const finalSimulatedUnitsSold = Math.min(simulatedUnitsPurchased, demandCeiling);
    
    // 6. Math Step 4: Final Profit Calculation
    const finalProjectedGrossProfit = finalSimulatedUnitsSold * profitPerUnit;

    // 7. Inject the "Receipt" into the UI
    receiptTitle.textContent = `Simulation : ${targetProd.nom}`;
    
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
        </ul>
    `;
}

// IGNITION: Starts the entire process when the file is loaded
loadData();

