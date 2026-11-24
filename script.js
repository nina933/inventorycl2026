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
let PRODS=[],STOCKY=[],TRANSFERTS=[],RECEPTIONS=[],PREVISION=[],PROMOS=[],BUDGET=[],PRIX_MAP={},PRIX_ID_MAP={},COUT_MAP={},DELAIS_MAP={},FORECAST=[],MAPPING_IDS=[];
let KIT_IDS=new Set(); // 🚀 IDs des variantes "kit/bundle" gérées par l'app Bundle — à cacher partout
// Phonebook specifically to store custom notes/comments about specific products.
let COMMENTS_MAP={};
let MOQ_MAP={};

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

// 🚀 NOUVEAU: Mode de tri pour l'onglet Réceptions — tableau de priorités
// ['date'] = tri par date seulement. ['date','fourn'] = tri par date PUIS par fournisseur (tie-break).
// ['fourn','date'] = tri par fournisseur PUIS par date. L'ordre du tableau = ordre de clic.
let SORT_MODE_R = ['date'];

function toggleSortModeR(mode) {
  const idx = SORT_MODE_R.indexOf(mode);
  if (idx > -1) {
    // On ne retire jamais le dernier critère actif — il doit toujours en rester au moins un
    if (SORT_MODE_R.length > 1) SORT_MODE_R.splice(idx, 1);
  } else {
    SORT_MODE_R.push(mode);
  }
  updateSortButtonsR();
  rReceptions();
}

function updateSortButtonsR() {
  const map = { date: document.getElementById('btn-sort-date'), fourn: document.getElementById('btn-sort-fourn') };
  Object.entries(map).forEach(([key, btn]) => {
    if (!btn) return;
    const active = SORT_MODE_R.includes(key);
    btn.classList.toggle('on', active);
    const existingBadge = btn.querySelector('.sort-badge');
    if (existingBadge) existingBadge.remove();
    if (active && SORT_MODE_R.length > 1) {
      const pos = SORT_MODE_R.indexOf(key) + 1;
      btn.insertAdjacentHTML('beforeend', ` <span class="sort-badge" style="font-size:9px;opacity:.65;font-weight:700">${pos}</span>`);
    }
  });
}


let PO_EXTRAS={}; 
let PO_CUSTOM={}; 
let PRIX_OVERRIDE={}; 
let SKU_OVERRIDE_TEMP={};
// 🚀 NOUVEAU: Infos Technique saisies dans la confirmation de PO (n° commande client, machine, n° de série), par ID de variante
let TECH_INFO_TEMP={};

function majInfoTechTemp(idVariante, champ, valeur){
  if(!TECH_INFO_TEMP[idVariante]) TECH_INFO_TEMP[idVariante]={};
  TECH_INFO_TEMP[idVariante][champ]=String(valeur||'').trim();
}

function infoTech(idVariante){
  const t=TECH_INFO_TEMP[idVariante]||{};
  return { cmdClient: t.cmdClient||'', machine: t.machine||'', serie: t.serie||'' };
}
let PO_IGNORED={};
const PRIX_FALLBACK_ID={"39423037636697":19.83,"39423037669465":158.64,"39423036424281":22.32,"39423036457049":178.56,"39505906171993":4.61,"39505906204761":46.1,"39505894735961":4.03,"39505894768729":47.0,"39286587293785":1968.6,"39379097354329":2852.6,"31133707206745":3846.0,"31133856268377":1505.0,"31133862428761":1606.0,"39505894047833":4.61,"39505894080601":46.1,"32062701142105":8696.25,"40247089332313":15.0,"40247089365081":27.0,"43204120707161":90.0,"32098752987225":806.25,"32102521372761":1668.75,"32102714474585":1946.25,"32102741082201":1308.75,"42622009081945":795.0,"42622009114713":821.25,"32113311580249":22.0,"32113329209433":15.0,"40509087449177":5810.0,"42153932980313":5810.0,"42153933013081":6125.0,"32163205382233":7341.75,"32177744183385":723.75,"42409361932377":1931.25,"42409361899609":2096.25,"42409361997913":2096.25,"32239440527449":1.5,"39286643425369":1450.0,"32382263394393":430.0,"32382263427161":430.0,"32382263459929":430.0,"39751786692697":514.5,"40467509608537":430.0,"41543633502297":430.0,"41543634288729":430.0,"40106547052633":26.21,"40106547085401":67.46,"42151907557465":19.46,"42151907590233":52.46,"32331606130777":62.6,"43204146921561":20.21,"43204146954329":121.26,"32363213258841":32.0,"43269554864217":10.0,"43269554896985":60.0,"32363222597721":10.0,"39471519531097":10.23,"39471519563865":62.0,"40430742110297":62.0,"40430742143065":50.46,"39471498657881":10.23,"40142641954905":72.0,"40430750203993":61.38,"40430750236761":50.46,"32391986380889":74.25,"39286560686169":2026.0,"39286571565145":2096.0,"39286575890521":2036.6,"39288837144665":281.25,"39768828575833":9345.0,"39768828608601":12350.0,"39768828674137":12350.0,"39768830017625":8872.0,"39768830083161":9068.0,"39768830115929":9068.0,"40523997773913":10000.0,"39305219571801":142.4,"39531804754009":76.5,"39531804786777":79.5,"39531804819545":84.0,"39305235365977":24.75,"39305244639321":190.5,"39305477226585":910.0,"39312028958809":31.5,"39312071229529":55.99,"40398413037657":20.0,"39312179101785":3.0,"39312381378649":15.0,"39797854797913":28.44,"39797854830681":33.12,"39797854863449":37.53,"39349384052825":296.25,"39349384085593":296.25,"40246770499673":371.25,"40246770466905":371.25,"39349445328985":562.5,"39356774416473":936.0,"39372578816089":115.0,"40306923602009":5.0,"41736710946905":9.22,"42190923956313":9.0,"39778636267609":7.0,"39379730399321":74.25,"39390188109913":4646.25,"39399568408665":52.46,"39399569031257":33.71,"39399570047065":32.21,"39399570243673":32.21,"39399574274137":104.96,"39420458369113":40.5,"39424787185753":29.25,"39424818643033":106.5,"42270065262681":48.0,"42270065229913":48.0,"39434677190745":11.9,"39434702782553":34.94,"39436545163353":23.03,"39438869921881":31.5,"39438923890777":73.5,"39522756427865":52.49,"39522756460633":55.99,"42727921188953":32.0,"42727921221721":32.0,"42727921254489":35.0,"40257060438105":83.25,"40257060470873":83.25,"40083939033177":3896.25,"40083939000409":3746.25,"42371511976025":8246.25,"42371512008793":8696.25,"39522762981465":52.49,"39522763014233":55.99,"39522837725273":69.99,"39531815403609":69.0,"43207052755033":63.75,"43207052787801":382.5,"39531874615385":57.71,"39668678033497":840.0,"39548266217561":840.0,"42031468970073":890.0,"39550847058009":51.75,"39550847090777":51.75,"39550896537689":927.99,"39550924554329":3519.0,"43273461694553":385.6,"43273461727321":385.6,"42484376469593":1343.99,"41827384983641":1343.99,"41827384950873":1343.99,"41568712753241":1535.99,"39592982511705":1535.99,"42484372570201":1535.99,"40401995399257":635.0,"40408832639065":675.0,"40401995432025":635.0,"39624643543129":32.0,"39624653242457":114.0,"40561531289689":201.6,"42849037221977":198.0,"40561531322457":198.0,"42849037254745":198.0,"40391467958361":1100.0,"40391513210969":2184.0,"40391513243737":2184.0,"40516151476313":410.0,"40516151443545":410.0,"41037192265817":410.0,"41037192331353":410.0,"42030647541849":410.0,"41037192298585":410.0,"41037274447961":992.0,"41037274480729":992.0,"40516235001945":2310.0,"41037280018521":3009.3,"41037280084057":3009.3,"41037280116825":3009.3,"41037280149593":3009.3,"40516293001305":630.0,"40903080476761":724.0,"41037176242265":724.0,"40903080443993":724.0,"41037180174425":724.0,"41037176209497":724.0,"42892182519897":724.0,"40516308074585":744.0,"40516567367769":1499.99,"42260065779801":24.0,"42260065812569":33.0,"40516616388697":72.0,"40516626055257":15.0,"40516639260761":15.0};
let PO_ENVOYES={};
let MODIF_PO_LINES=[];
let MODIF_PO_CTX=null;
let PO_TOGGLE_STATE={};


// SORTS is the memory for the table headers. It remembers which column is clicked 
// for every single tab. 'dir: 1' means sorting lowest-to-highest (A-Z). 'dir: -1' means highest-to-lowest.
// (e.g., 'a' = Alertes tab, 's' = Stocks tab, 'v' = Ventes tab).
// Add d:{col:'capital',dir:-1} to the end of this list
// Cleaned up SORTS: Removed 'e' (Etat des stocks), added 'b' (Budget) and kept 'd' (Dormant) (July 16th)
let SORTS={
  a:{col:'stock',dir:1},
  s:{col:'stock',dir:1},
  v:{col:'vt',dir:-1},
  fc:{col:'nom',dir:1},
  pr:{col:'nom',dir:1},
  b:{col:'sn',dir:1},
  d:{col:'capital',dir:-1},
  sb:{col:'vendu',dir:-1},
  po:{col:'nom',dir:1}, // NOUVEAU: Tri pour le tableau de création PO
  map:{col:'nom',dir:1} // NOUVEAU: Tri pour la table de mapping
};
// Temporary buckets to hold the specific, filtered results for the Alertes and Stocks tables.
let PRODS_A=[],PRODS_S=[];

// A Phonebook linking a Supplier to a specific team member (e.g., matching a supplier to Nina or Clovis).
let VENDOR_MAP={};

// A sticky note that remembers which team member's button is currently clicked at the top of the screen.
let EQUIPE_FILTER='';

// 🚀 NOUVEAU: Produits de l'équipe Technique (Type de produit = parts)
let TECH_IDS=new Set(), TECH_NOMS=new Set(), TECH_FOURNS=new Set();

// NOUVEAU: Mémoire pour cacher les doublons "Déjà dans PO"
let PO_HIDDEN_DUPLICATES = {};









// ---------------------------------------------------------
// CORE UTILITIES
// ---------------------------------------------------------
// "mini-tool" to call its name whenever we need it
// The Data Cleaners, The Formatters, The Visual Decorators, and The Team Filters.

// Convertit le calendrier retail (Dimanche - Samedi) en index de mois (0-11)
function getMonthFromCompanyWeek(week, year) {
    // 🚀 FIX: Universal ISO Date offset (Works dynamically forever)
    const simpleDate = new Date(year, 0, 1 + (week - 1) * 7);
    
    // Add 3 days to land on Thursday (Thursday determines the majority month of the week)
    simpleDate.setDate(simpleDate.getDate() + 3);
    
    return simpleDate.getMonth(); 
}

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

// 🚀 NOUVEAU: Détecte si un produit / une ligne appartient à l'équipe Technique
// (Type de produit "parts" ou nom commençant par "Parts:")
function estTechnique(item){
  if(!item) return false;
  if(item.equipe) return item.equipe==='technique';
  const id=String(item.idVariante||'');
  if(id && TECH_IDS.has(id)) return true;
  return !!item.nom && TECH_NOMS.has(item.nom);
}

// Vérifie si un fournisseur (ou un produit précis, si "item" est fourni) appartient
// à l'équipe sélectionnée en haut de l'écran. Les produits Technique passent AVANT
// la correspondance fournisseur (un même fournisseur peut avoir des machines chez Nina
// et des pièces chez Technique).
function equipeMatch(fourn, item){
  if(!EQUIPE_FILTER)
    return true;

  if(item){
    if(estTechnique(item)) return EQUIPE_FILTER==='technique';
    if(EQUIPE_FILTER==='technique') return false;
  } else if(EQUIPE_FILTER==='technique'){
    // Niveau fournisseur seulement : le fournisseur a-t-il au moins une pièce ?
    return TECH_FOURNS.has((fourn||'').trim());
  }
  
  // Strip the Mirage tag so Nina/Clovis routing still works perfectly
  const cleanFourn = (fourn || '').replace(' (Café)', '').trim();
  const eq=(VENDOR_MAP[cleanFourn]||'').toLowerCase();
  return eq.includes(EQUIPE_FILTER);
}

// 🚀 NOUVEAU: Nom affiché de l'équipe sélectionnée (titres du Budget)
function libelleEquipe(){
  return {'':'Tous','nina':'Nina','clovis':'Clovis','technique':'Technique'}[EQUIPE_FILTER] || EQUIPE_FILTER;
}

// 🚀 NOUVEAU: Recalcule le Budget pour l'équipe sélectionnée (Tous / Nina / Clovis / Technique)
function calculerBudget(){
  BUDGET=[];
  for(let i=1;i<=52;i++){
    const val=PREVISION.reduce((s,r)=>equipeMatch(r.fourn, r)?s+(r.sems[i]||0)*(r.prix||0):s,0);
    BUDGET.push({label:'Semaine '+i,val:Math.round(val),sn:i});
  }
}

// When you click "Nina", "Clovis" or "Technique", this function executes. It highlights the button you clicked, 
// and instantly refreshes the screen.
function setEquipe(eq,el){
  EQUIPE_FILTER=eq;
  document.querySelectorAll('.eq-btn').forEach(b=>b.classList.remove('on'));
  el.classList.add('on');
  // 🚀 NOUVEAU: Le Budget suit l'équipe sélectionnée
  calculerBudget();
  SEL_BUDGET=null;
  const det=document.getElementById('bdet');
  if(det) det.style.display='none';
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

// Takes a raw number and rounds it, BUT allows decimals if they are needed for bulk orders
function fmt(v){
  const num = n(v);
  // S'il y a une décimale, on l'affiche. Sinon, on garde un nombre entier propre.
  return (num % 1 !== 0) 
    ? num.toLocaleString('fr-CA', {minimumFractionDigits:1, maximumFractionDigits:2}) 
    : Math.round(num).toLocaleString('fr-CA');
}

// Takes a raw number and turns it into Canadian currency formatting (e.g., 1 235,50 $).
function fmtM(v){
  return n(v).toLocaleString('fr-CA',{minimumFractionDigits:2,maximumFractionDigits:2})+' $';
}

// Computers read dates as giant ugly timestamps. This tool chops that up and returns a clean date.
function fmtD(iso){
  if(!iso||iso==='') return'—';
  try{
    let d;
    if(typeof iso==='string'&&iso.includes('T')){
        const p=iso.substring(0,10).split('-');
        d=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
    } else {
        d=new Date(iso);
    }
    if(isNaN(d)) return String(iso).trim(); // 🚀 FIX: No longer chops text like "Fin septembre"
    const dd=String(d.getDate()).padStart(2,'0');
    const mm=String(d.getMonth()+1).padStart(2,'0');
    const yy=String(d.getFullYear()).substring(2);
    return dd+'/'+mm+'/'+yy;
  } catch{
    return String(iso).trim();
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

// 🚀 NOUVEAU: Détecte si un produit se vend moins d'une fois par mois (faible rotation).
// Un produit est exclu si son forecast annuel total est < 12 unités,
// SAUF si le solde (stock + commandes en cours) reste négatif — dans ce cas il reste visible.
function estFaibleRotation(nomProduit, soldeActuel) {
  // 🚀 NOUVEAU: Les pièces (équipe Technique) ne sont jamais masquées pour faible rotation
  if (TECH_NOMS.has(nomProduit)) return false;
  const fMatch = FORECAST.find(x => x.nom === nomProduit);
  let forecastAnnuel = 0;
  if (fMatch) {
    forecastAnnuel = (fMatch.M01||0) + (fMatch.M02||0) + (fMatch.M03||0) + (fMatch.M04||0) +
                     (fMatch.M05||0) + (fMatch.M06||0) + (fMatch.M07||0) + (fMatch.M08||0) +
                     (fMatch.M09||0) + (fMatch.M10||0) + (fMatch.M11||0) + (fMatch.M12||0);
  }
  return (forecastAnnuel < 12 && soldeActuel >= 0);
}

// 🚀 NOUVEAU: Centralise la liste d'exclusion (bundles, gift cards, etc.) pour éviter la duplication
function estProduitExclu(nom) {
  const lowerName = String(nom||'').toLowerCase();
  return lowerName.includes("3 months of free coffee") ||
      lowerName.includes("decaf -swiss process") ||
      lowerName.includes("new wave") ||
      lowerName.includes("hoodies") ||
      lowerName.includes("gift card") ||
      lowerName.includes("bundle") ||
      lowerName.includes("demo") ||
      lowerName.includes("open box") ||
      lowerName.includes("return") ||
      lowerName.includes("refurbished") ||
      lowerName.includes("à vendre en boutique") ||
      lowerName.includes("tasting pack") ||
      lowerName.includes("3 x 1kg");
}

// 🚀 NOUVEAU: Masque les produits Smeg et Pavoni dans Alertes/Critique et Construire un PO
// (le fournisseur reste sélectionnable dans les menus déroulants — seules les lignes sont cachées)
function estFournisseurExclu(fourn) {
  const clean = String(fourn||'').replace(' (Café)', '').trim().toLowerCase();
  return clean.includes('smeg') || clean.includes('pavoni');
}

// Exclut les formats en sacs ("bags") de tout le dashboard
// 🚀 MODIFIÉ: les pièces "Parts:" ne sont plus exclues — elles sont attribuées à l'équipe Technique
function estExcluDashboard(nom, variante) {
  const texte = String(nom || '') + ' ' + String(variante || '');
  if (/\bbags?\b/i.test(texte)) return true;                 // contient "bag" ou "bags"
  return false;
}


function rForecast(){
  const srch=(document.getElementById('s-fc')?.value||'').toLowerCase();
  const fourns=gC('ffc'),pars=gC('pfc');
  let rowsFc=FORECAST.filter(r=>{
    if(!equipeMatch(r.fourn, r))return false;
    if(fourns.length&&!fourns.includes(r.fourn))return false;
    if(pars.length&&!pars.includes(r.cat))return false;
    if(srch&&!r.nom.toLowerCase().includes(srch))return false;

    // 🚀 NOUVEAU: Exclure les produits à faible rotation (< 1 vente/mois), sauf rupture stricte
    const pMatch=PRODS.find(x=>x.nom===r.nom);
    const soldeActuel=pMatch?pMatch.solde:0;
    if(estFaibleRotation(r.nom,soldeActuel))return false;

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
    const varActuelle = prod ? prod.variante : '';
    const cleanNom = (varActuelle && r.nom.endsWith(' - ' + varActuelle)) ? r.nom.slice(0, -(varActuelle.length + 3)) : r.nom;
    const varHtml = varActuelle ? '<div class="pv">' + varActuelle + '</div>' : '';
    return '<tr><td><div class="pn">'+cleanNom+'</div>'+varHtml+'</td><td style="color:var(--t2);font-size:12px">'+r.fourn+'</td><td>'+bP(r.cat)+'</td><td style="text-align:right"><span class="'+stockCls+'">'+stockVal+'</span></td>'+
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
    let resp = await fetch(URL_AS);
    
    // 🚀 THE FIX: Silent Auto-Retry for Google's "Sleeping Server" 404 errors
    let retries = 2;
    while (!resp.ok && resp.status === 404 && retries > 0) {
        retries--;
        setMsg('Réveil du serveur Google... veuillez patienter.');
        await new Promise(resolve => setTimeout(resolve, 1500)); // Pauses for 1.5 seconds
        resp = await fetch(URL_AS); // Knocks on the door again silently
    }

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

    // -----------------------------------------------------------------
    // CHARGEMENT DES TAILLES DE LOTS (MOQ)
    // -----------------------------------------------------------------
    MOQ_MAP = {};
    // Find the tab regardless of exact capitalization or trailing spaces
    const ongletMOQ = Object.keys(raw).find(k => k.toLowerCase().trim() === 'tailles de lot');
    
    if (ongletMOQ && raw[ongletMOQ]) {
        raw[ongletMOQ].slice(1).forEach(r => {
            // Check that columns D (3) and E (4) actually exist in the row
            if (r.length > 4) {
                const idLot = String(r[3] || '').replace(/\D/g, ''); 
                const qtyLot = parseInt(r[4]) || 1;                  
                if (idLot && qtyLot > 1) {
                    MOQ_MAP[idLot] = qtyLot;
                }
            }
        });
    } else {
        console.warn("⚠️ Onglet 'Tailles de Lot' introuvable dans les données Google Sheets.");
    }


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

    // ==========================================
    // 🚀 NOUVEAU : INJECTION DU MAPPING DES IDs
    // ==========================================
    MAPPING_IDS = [];
    (raw['Mapping IDs'] || []).slice(1).forEach(r => {
        const ancien = String(r[0] || '').replace(/\D/g, '');
        const nouveau = String(r[1] || '').replace(/\D/g, '');
        const nom = String(r[2] || '').trim();
        const variante = String(r[3] || '').trim();
        
        if (ancien && nouveau) {
            MAPPING_IDS.push({ ancien, nouveau, nom, variante });
            
            // Transfert Magique des Ventes N-1 de l'ancien ID vers le nouveau !
            if (VN1_ID_MAP[ancien]) {
                VN1_ID_MAP[nouveau] = (VN1_ID_MAP[nouveau] || 0) + VN1_ID_MAP[ancien];
            }
            if (VN1_MONTHLY_MAP[ancien]) {
                if (!VN1_MONTHLY_MAP[nouveau]) VN1_MONTHLY_MAP[nouveau] = [0,0,0,0,0,0,0,0,0,0,0,0];
                for (let i = 0; i < 12; i++) {
                    VN1_MONTHLY_MAP[nouveau][i] += VN1_MONTHLY_MAP[ancien][i];
                }
            }
        }
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
    KIT_IDS=new Set(); // 🚀 Réinitialisé à chaque chargement
    TECH_IDS=new Set(); TECH_NOMS=new Set(); TECH_FOURNS=new Set(); // 🚀 NOUVEAU: équipe Technique
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
      // 🚀 NEW: Read Column S (Index 18) for the Product Type to create the Mirage Supplier
      const fournOriginal = String(r[8]||'').trim();
      const typeProduit = String(r[18]||'').toLowerCase().trim();
      
      let fourn = fournOriginal;
      // Exception : Espresso Mali reste unifié, pas de séparation Café / non-Café
      if (typeProduit === 'coffee' && !fournOriginal.toLowerCase().includes('mali')) {
          fourn = fournOriginal + ' (Café)';
      }
      
      const variante=String(r[3]||'').trim();

// 🚀 NOUVEAU: Exclure les variantes "kit" gérées par l'app Bundle (stock déjà lié au produit parent)
// Exception : Jura - Lelit vend de vrais "pack of X" qui ne sont PAS des kits/bundles
const estJuraLelit = fourn.replace(' (Café)','').trim() === 'Jura - Lelit';
const matchKit = estJuraLelit
  ? /bags?\s+of|years?\s+of|box(?:es)?\s+of/i.test(variante)
  : /bags?\s+of|packs?\s+of|years?\s+of|box(?:es)?\s+of/i.test(variante);
if (matchKit) { KIT_IDS.add(idVariante); return; }

// Exclure les formats "bags" de tout le dashboard
if (estExcluDashboard(nom, variante)) { KIT_IDS.add(idVariante); return; }

// 🚀 NOUVEAU: Type de produit "parts" (ou nom "Parts:") → équipe Technique
const estTech = typeProduit === 'parts' || /^\s*parts\s*:/i.test(nom);
if (estTech) { TECH_IDS.add(idVariante); TECH_NOMS.add(nom); TECH_FOURNS.add(fourn); }

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
      
      const _r0=String(r[0]||'').trim().replace(/\s*\|\s*$/,'');
      const vn1=VN1_ID_MAP[idVariante]||VN1_MAP[nb]||VN1_MAP[nom]||VN1_MAP[_r0]||VN1_NORM[normKey(nb)]||VN1_NORM[normKey(nom)]||VN1_NORM[normKey(_r0)]||0;
      
      // ==========================================
      // 🚀 DORMANT STOCK INJECTION: Variable Attach
      // ==========================================
      const cout_unitaire = COUT_MAP[idVariante] || COUT_MAP[normKey(nom)] || COUT_MAP[normKey(nb)] || 0;
      const vn1_months_array = VN1_MONTHLY_MAP[idVariante] || [0,0,0,0,0,0,0,0,0,0,0,0];

      PRODS.push({nom,nb,variante:variante==='Default Title'?'':variante,fourn,statut_produit,stock,pareto,
      en_cmd: 0, statut: 'active', solde: 0, // 🚀 Will be dynamically calculated later
      fc_m05:fc_cur,wks_left,demande_cumulee:demandeCumulee,vt:vd.total||0,vm:vd.moy||0,vc:vd.curV||0,sems:vd.sems||{},vn1,idVariante,skuFourn,
      cout: cout_unitaire, id: idVariante, vn1_months: vn1_months_array,
      fc_mois: fc, // 🚀 NOUVEAU: forecast mensuel conservé pour la vue hebdo 
      equipe: estTech ? 'technique' : ''}); // 🚀 NOUVEAU: équipe Technique
    });

    // 🚀 NEW: Sync the Mirage supplier names to the Forecast data
    FORECAST.forEach(f => {
        const pMatch = PRODS.find(p => p.nom === f.nom);
        if (pMatch) f.fourn = pMatch.fourn;
    });

    // Stocky Orders
    const byCmd={};
    (raw['Stocky Orders']||[]).slice(1).forEach(r=>{
      const cmd=String(r[5]||'').trim();
      const nomComplet=String(r[1]||'').trim(); 
      if(!cmd||!nomComplet||cmd.startsWith('Dernière')||cmd.startsWith('Actualisation'))return;
      
      // 🚀 NEW: Robust Date Capture
      const rawOriginal = String(r[7]||'').trim();
      const rawNew = String(r[9]||'').trim();
      
      let finalDate = rawNew || rawOriginal;
      let isIndet = !finalDate || finalDate.toLowerCase().includes('indeterminé') || finalDate.toLowerCase().includes('indéterminé');
      
      let livraisonFmt = isIndet ? 'Indéterminé' : fmtD(finalDate);
      let livraisonOrigFmt = (rawNew && rawOriginal && rawNew !== rawOriginal && !rawOriginal.toLowerCase().includes('indeterminé')) ? fmtD(rawOriginal) : '';

      // 🚀 NEW: Split POs into separate cards if they have different dates
      const groupKey = cmd + '_' + livraisonFmt;

      if(!byCmd[groupKey])byCmd[groupKey]={
        cmd,
        fourn:String(r[4]||'').trim(),
        livraison: livraisonFmt,
        livraison_originale: livraisonOrigFmt,
        date_cmd:'',
        lignes:[],
        total:0
      };
      
      const qty=n(r[6]||1);
      const com = rawNew ? fmtD(rawNew) : '';
      
      // 🚀 FIXED: Grab the brand new Status from Column N (Index 13)
      const statusLigne = String(r[13]||'').trim(); 

      byCmd[groupKey].lignes.push({
        nom: nomComplet,
        variante: String(r[2]||''),
        idVariante: String(r[3]||'').replace(/\D/g, ''), 
        qty,
        livraison: livraisonFmt,
        com,
        status: statusLigne // 🚀 Passes status down to the Receptions table logic!
      });
      byCmd[groupKey].total+=qty;
    });
    STOCKY=Object.values(byCmd).filter(c=>c.lignes.length>0).sort((a,b)=>b.cmd-a.cmd);

    // Transferts
    const byCmdT={};
    (raw['Transferts']||[]).slice(1).forEach(r=>{
      const cmd=String(r[5]||'').trim();
      const nomComplet=String(r[1]||'').trim();
      if(!cmd||!nomComplet)return;
      
      // 🚀 NEW: Robust Date Capture
      const rawOriginal = String(r[7]||'').trim();
      const rawNew = String(r[9]||'').trim();
      
      let finalDate = rawNew || rawOriginal;
      let isIndet = !finalDate || finalDate.toLowerCase().includes('indeterminé') || finalDate.toLowerCase().includes('indéterminé');
      
      let livraisonFmt = isIndet ? 'Indéterminé' : fmtD(finalDate);
      let livraisonOrigFmt = (rawNew && rawOriginal && rawNew !== rawOriginal && !rawOriginal.toLowerCase().includes('indeterminé')) ? fmtD(rawOriginal) : '';

      // 🚀 NEW: Split Transfers into separate cards if they have different dates
      const groupKey = cmd + '_' + livraisonFmt;

      if(!byCmdT[groupKey])byCmdT[groupKey]={
        cmd,
        fourn:String(r[4]||'').trim(),
        livraison: livraisonFmt,
        livraison_originale: livraisonOrigFmt,
        date_cmd:'',
        lignes:[],
        total:0
      };      
      
      const qty=n(r[6]||0);
      const statusLigne = String(r[13]||'').trim(); 
      const comT = rawNew ? fmtD(rawNew) : '';
      
      byCmdT[groupKey].lignes.push({
        nom: nomComplet,
        titre: nomComplet,
        variante: String(r[2]||''),
        idVariante: String(r[3]||'').replace(/\D/g, ''), 
        sku: String(r[8]||'').trim(),
        qty,
        livraison: livraisonFmt,
        com: comT,
        status: statusLigne 
      });      
      byCmdT[groupKey].total+=qty;
    });
    TRANSFERTS=Object.values(byCmdT).filter(c=>c.lignes.length>0).sort((a,b)=>b.cmd.localeCompare(a.cmd));
// =================================================================
    // 🚀 DYNAMIC "EN COMMANDE" CALCULATION
    // =================================================================
    // The dashboard calculates incoming stock internally, ignoring Google Sheet formulas!
    
    [...STOCKY, ...TRANSFERTS].forEach(order => {
        order.lignes.forEach(l => {
            // Only tally quantities that are actively in transit
            if (l.status !== 'Reçu' && l.status !== 'Annulé' && l.qty > 0) {
                const p = PRODS.find(x => x.idVariante === l.idVariante || normKey(x.nom) === normKey(l.nom));
                if (p) p.en_cmd += l.qty;
            }
        });
    });

        // Now calculate the true Status and Solde using the accurate en_cmd
    PRODS.forEach(p => {
        p.solde = p.stock + p.en_cmd; // 🚀 Calculate Solde FIRST so we can use it!

        if (p.stock <= 0 && p.solde < 0) { 
            p.statut = 'rupture'; // Stock physique ≤ 0 ET même avec les commandes en cours, ça reste négatif
        } else if (p.solde < p.demande_cumulee) {
            p.statut = 'critique'; // Peu importe le stock : le solde total ne couvre pas la demande cumulée
        } else {
            p.statut = 'active'; // Solde suffisant pour couvrir la demande
        }
    });


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
        
        // NOUVEAU FILTRE : On supprime les alertes pour les lignes "Reçu" ou "Annulé" !
        const lignesResolues=c.lignes.filter(l => l.qty > 0 && l.status !== "Reçu" && l.status !== "Annulé").map(l=>{
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
      
      // 🚀 NEW: Inherit the Mirage supplier name from PRODS
      const fournFinal = pMatch ? pMatch.fourn : String(r['Fournisseur']||'').trim();
      
      return{nom,fourn:fournFinal,cat:(idPrev&&ABC_ID_MAP[idPrev])||ABC_MAP[nom]||String(r['Catégorie']||'C'),        delai:n(r['Délai livraison']),
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

    // Retirer les formats "bags" des prévisions (onglet Forecast + Budget)
    // 🚀 NOUVEAU: Les pièces (équipe Technique) sont exclues du calcul des PO et du Budget
    FORECAST = FORECAST.filter(f => !estExcluDashboard(f.nom));
    PREVISION = PREVISION.filter(r => !estExcluDashboard(r.nom) && !estTechnique(r));

    // Promos
    PROMOS=pT(raw['Promos']||[]).filter(r=>(r['Produit']||r['SKU']||r['Sku'])&&(r['Date Début']||r['Date Fin'])).map(r=>{
      const boost=n(String(r['Boost%']||'0').replace('%',''));
      const prixPromo=n(r['Prix promo']||r['Prix Promo']||r['Prix régulier promo']||0);
      const variante=String(r['Variante Shopify']||'').trim();
      const sku=String(r['SKU']||r['Sku']||'').trim(); 
      const produit=String(r['Produit']||'').trim();   
      
      // 🚀 NOUVEAU : True Time Engine (Bulletproof timestamp logic)
      let dStart = new Date(r['Date Début']);
      let dEnd = new Date(r['Date Fin']);
      const tsStart = isNaN(dStart.getTime()) ? 0 : dStart.setHours(0,0,0,0);
      const tsEnd = isNaN(dEnd.getTime()) ? 0 : dEnd.setHours(23,59,59,999); // Ensures promo lasts until 11:59 PM on the final day

      return{produit,sku,marque:String(r['Marque']||''),
        dd:fmtD(r['Date Début']),df:fmtD(r['Date Fin']),
        sd:n(r['Sem. Début (ISO)']),sf:n(r['Sem. Fin (ISO)']),
        tsStart, tsEnd, // 🚀 Variables injected into memory
        boost,prixPromo,variante};
    });

    // Budget — 🚀 MODIFIÉ: calculé pour l'équipe sélectionnée (recalculé à chaque changement d'équipe)
    calculerBudget();

    FOURNISSEURS=[...new Set(PRODS.map(p=>p.fourn).filter(Boolean))].sort();

    const W=cw();
    document.getElementById('tinfo').textContent=`Google Sheets · Live · S${W} · ${new Date().toLocaleDateString('fr-CA')}`;
    document.getElementById('tupd').textContent='MAJ '+new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});
    // 🚀 FIXED: Only count POs and Transfers that have at least one active, incoming item
    const activeStocky = STOCKY.filter(c => c.lignes.some(l => l.status !== 'Reçu' && l.status !== 'Annulé' && l.qty > 0)).length;
    const activeTransfers = TRANSFERTS.filter(c => c.lignes.some(l => l.status !== 'Reçu' && l.status !== 'Annulé' && l.qty > 0)).length;
    document.getElementById('nb-r').textContent = (activeStocky + activeTransfers) || '';
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

  // 🚀 FIXED: Only target 'f-r' since the others use checkboxes or were deleted
  ['f-r'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=opts;});

  // Build the "Week Selection" Dropdowns (e.g., S24, S25, S26)
  const W=cw();
  const swOpts=[];

  // Generate options from 4 weeks ago, up to 12 weeks in the future
  for(let i=Math.max(1,W-4);i<=Math.min(52,W+12);i++)
    swOpts.push(`<option value="${i}"${i===W?' selected':''}>S${String(i).padStart(2,'0')}${i===W?' (courante)':''}</option>`);

  // 🚀 Change le comportement par défaut pour désélectionner la semaine courante
  const swr=document.getElementById('sw-r');
  if(swr) {
      swr.innerHTML='<option value="" selected>Toutes semaines</option>' + 
                    swOpts.join('').replace(' selected', '') + 
                    '<option value="indetermine">Indéterminé</option>'; // 🚀 NOUVELLE OPTION
  }

  const ddlSwpo = document.getElementById('ddl-swpo');
  if(ddlSwpo && !ddlSwpo.childElementCount){
    ddlSwpo.innerHTML = (() => {
      const arr = [];
      for(let i = Math.max(1, W - 4); i <= Math.min(52, W + 16); i++) arr.push(i);
      return arr;
    })().map(i => `<label class="dd-item"><input type="checkbox" name="swpo" value="${i}"${i===W?' checked':''} onchange="updDD('dd-swpo','swpo');rPO()"> S${String(i).padStart(2,'0')}${i===W?' (courante)':''}</label>`).join('');
    updDD('dd-swpo','swpo');

    // 🚀 NEW: Build Mapping supplier filter
    const fMap = document.getElementById('map-fourn');
    if (fMap) {
      fMap.innerHTML = '<option value="">Fournisseur...</option>' + FOURNISSEURS.map(f => `<option>${f}</option>`).join('');
    } 
  }

  const swpr=document.getElementById('sw-pr');
  if(swpr)swpr.innerHTML='<option value="">Toutes semaines</option>'+swOpts.join('');

  // Build the specific PO filter
  // Build the specific PO filter
  const fpo=document.getElementById('f-po');
  if(fpo){
    const W2=cw();
    const pf=[...new Set(PREVISION.filter(r=>r.sems[W2]>0).map(r=>r.fourn).filter(Boolean))].sort();
    // 🚀 THE FIX: Add the non-active suppliers to the dropdown
    const autres = FOURNISSEURS.filter(f => !pf.includes(f)).sort();
    fpo.innerHTML='<option value="">Tous les fournisseurs</option>' +
      '<optgroup label="Actifs (S'+String(W2).padStart(2,'0')+')">' + pf.map(f=>`<option>${f}</option>`).join('') + '</optgroup>' +
      '<optgroup label="Autres">' + autres.map(f=>`<option>${f}</option>`).join('') + '</optgroup>';
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
  else if(v==='ventes')rVentes();
  else if(v==='receptions')rReceptions();
  else if(v==='po')rPO();
  else if(v==='budget')rBudget();
  else if(v==='promos')rPromos();
  else if(v==='forecast')rForecast();
  else if(v==='dormant')rDormant();
  else if(v==='scanback')rScanback(); // NOUVEAU ROUTAGE
  else if(v==='mapping')rMapping(); // NOUVEAU
  else if(v==='surstock')rSurstock(); // NOUVEAU : Surstock & tendance
  
}

function srt(tbl,col,el){
  const s=SORTS[tbl];
  // ADD d:'dormant' to the end of this map:
  const viewMap={a:'alertes',s:'stocks',v:'ventes',fc:'forecast',pr:'promos', d:'dormant'};  
  const scope=tbl==='f'?document.getElementById('fc'):document.getElementById('v-'+(viewMap[tbl]||tbl));
  scope?.querySelectorAll('th').forEach(t=>{t.classList.remove('asc','desc');});
  if(s.col===col)s.dir*=-1;else{s.col=col;s.dir=1;}
  el.classList.add(s.dir===1?'asc':'desc');
  
  // ADD  else if(tbl==='d')rDormant();  to the end of this line:
  if(tbl==='a') rAlertes();
  else if(tbl==='s')rStocks();
  else if(tbl==='v')rVentes();
  else if(tbl==='fc')rForecast();
  else if(tbl==='pr')rPromos();
  else if(tbl==='b')rBudget();
  else if(tbl==='d')rDormant();
  else if(tbl==='sb')rScanback();
  else if(tbl==='po')rPO(); // NOUVEAU ROUTAGE
  else if(tbl==='map')rMapping(); // NOUVEAU
}


// The actual sorting logic behind the scenes.
function sortProds(arr,col,dir){
  return [...arr].sort((a,b)=>{
    let va=a[col],vb=b[col];

    // Special rule: Ensure Pareto sorts correctly (A is better than B, B is better than C)
    if(col==='pareto'||col==='cat'){const o={A:0,B:1,C:2};va=o[va]??3;vb=o[vb]??3;}
    // 🚀 NEW: Intelligent French Locale Sorting (Ignores accents, caps, and handles numbers)
    else if(typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb, 'fr', { numeric: true, sensitivity: 'base' }) * dir;
    }
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

    // NOUVEAU: Exclusion stricte des bundles et produits virtuels
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
        lowerName.includes("à vendre en boutique") ||
        lowerName.includes("tasting pack") ||       // NOUVEAU : Exclut les packs dégustation
        lowerName.includes("3 x 1kg");

    if (isExcluded) return false;

    // 🚀 NOUVEAU: Exclure les produits à faible rotation (< 1 vente/mois), sauf si le solde reste négatif
    if (estFaibleRotation(p.nom, p.solde)) return false;

    const isR=p.statut==='rupture',isC=p.statut==='critique';

    if(!isR&&!isC)
      return false;

    // 🚀 NOUVEAU: Masquer les produits Smeg et Pavoni seulement en critique (rupture reste visible)
    if (isC && estFournisseurExclu(p.fourn)) return false;

    // Hide the alert if incoming orders completely solve the deficit and cover the demand
    if (p.stock + p.en_cmd >= Math.max(0, p.demande_cumulee)) {
        return false;
    }

    // Strict requirement: Don't flag active items as critical if nobody wants to buy them
    if(p.statut!=='rupture'&&p.demande_cumulee<=0)
      return false;   

    // Team check (Nina / Clovis / Technique)
    if(!equipeMatch(p.fourn, p))
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
  const ruptures = PRODS.filter(p => p.statut === 'rupture' && equipeMatch(p.fourn, p) && (p.stock + p.en_cmd) < Math.max(0, p.demande_cumulee) && !estProduitExclu(p.nom) && !estFaibleRotation(p.nom, p.solde)).length;
  const crit = PRODS.filter(p => p.statut === 'critique' && equipeMatch(p.fourn, p) && (p.stock + p.en_cmd) < p.demande_cumulee && !estProduitExclu(p.nom) && !estFournisseurExclu(p.fourn) && !estFaibleRotation(p.nom, p.solde)).length;
  const actifs = PRODS.filter(p => p.statut_produit === 'active' && equipeMatch(p.fourn, p)).length;
  const pa = PRODS.filter(p => (p.statut === 'rupture' || p.statut === 'critique') && p.pareto === 'A' && p.demande_cumulee > 0 && equipeMatch(p.fourn, p) && (p.stock + p.en_cmd) < Math.max(0, p.demande_cumulee) && !estProduitExclu(p.nom) && !(p.statut === 'critique' && estFournisseurExclu(p.fourn)) && !estFaibleRotation(p.nom, p.solde)).length;

  // Inject the KPI boxes into the HTML
  document.getElementById('mg-a').innerHTML=`${anaCarteAlertes()}
    <div class="mc" onclick="clearDD('dd-sta','sta',null);clearDD('dd-pa','pa',null);clearDD('dd-fa','fa',null);rAlertes()"><div class="mcl">Produits actifs</div><div class="mcv">${fmt(actifs)}</div><div class="mcs">Tout réinitialiser</div></div>
    <div class="mc" onclick="clearDD('dd-pa','pa',null);clearDD('dd-fa','fa',null);sC('sta',['rupture']);updDD('dd-sta','sta');rAlertes()"><div class="mcl">Ruptures (stock=0)</div><div class="mcv r">${fmt(ruptures)}</div><div class="mcs">↗ Cliquer pour voir</div></div>
    <div class="mc" onclick="clearDD('dd-pa','pa',null);clearDD('dd-fa','fa',null);sC('sta',['critique']);updDD('dd-sta','sta');rAlertes()"><div class="mcl">Critique</div><div class="mcv a">${fmt(crit)}</div><div class="mcs">↗ Cliquer pour voir</div></div>
    <div class="mc" onclick="clearDD('dd-sta','sta',null);clearDD('dd-fa','fa',null);sC('pa',['A']);updDD('dd-pa','pa');rAlertes()"><div class="mcl">Alertes Pareto A</div><div class="mcv b">${fmt(pa)}</div><div class="mcs">↗ Cliquer pour voir</div></div>
    <div class="mc" onclick="nav('receptions',document.querySelectorAll('.ni')[4])"><div class="mcl">Réceptions en cours</div><div class="mcv g">${fmt(STOCKY.filter(c => c.lignes.some(l => l.status !== 'Reçu' && l.status !== 'Annulé' && l.qty > 0)).length + TRANSFERTS.filter(c => c.lignes.some(l => l.status !== 'Reçu' && l.status !== 'Annulé' && l.qty > 0)).length)}</div><div class="mcs">↗ Voir les commandes</div></div>`;
  
  document.getElementById('nb-a').textContent=rows.length||'';
  document.getElementById('rc-a').textContent=rows.length+' produit(s)';

  // DRAW THE TABLE: Generate the HTML for every single row and insert it into the page
  // DRAW THE TABLE: Generate the HTML for every single row and insert it into the page
  const now = Date.now(); // 🚀 NEW: Grabs the exact millisecond of right now
  document.getElementById('tb-a').innerHTML=rows.map(p=>{ // Remember to keep this specific to tb-a, tb-s, or tbody depending on the function!
    const cleanNom = (p.variante && p.nom.endsWith(' - ' + p.variante)) ? p.nom.slice(0, -(p.variante.length + 3)) : p.nom;
    
    // 🚀 NEW: Bulletproof timestamp comparison
    const enPromo = PROMOS.some(pr => (pr.sku === p.skuFourn || normKey(pr.produit) === normKey(p.nom) || normKey(pr.produit) === normKey(p.nb)) && now >= pr.tsStart && now <= pr.tsEnd);
    const searchKey = p.skuFourn ? p.skuFourn.replace(/'/g,"\\\\'") : p.nom.replace(/'/g,"\\\\'");
    const promoBadge = enPromo ? `<span class="promo-link" title="Voir la promotion" onclick="allerAuxPromos('${searchKey}')">⭐ Promo</span>` : '';

    return `<tr>
    <td><div class="pn">${cleanNom}${promoBadge}</div>${p.variante?`<div class="pv">${p.variante}</div>`:''}</td>
    <td style="white-space:nowrap;font-size:12px">${p.fourn||'—'}</td>
    <td>${bP(p.pareto)}</td>
    <td style="text-align:right"><span class="${sc(p.stock)}">${fmt(p.stock)}</span></td>
    <td>${bS(p.statut,p.statut_produit)}</td>
    <td style="text-align:right;font-size:12px">${p.wks_left!==null?p.wks_left+' sem.':'—'}</td>
    <td style="text-align:right">${p.en_cmd > 0 ? `<span class="cmd-link" onclick="allerAuxReceptions('${p.nom.replace(/'/g,"\\\\'")}')">${fmt(p.en_cmd)}</span>` : '—'}</td>
    <td style="text-align:right">${fmt(p.fc_m05)}</td>
    <td style="text-align:right;font-weight:500;color:${p.statut==='rupture'?'var(--re)':p.statut==='critique'?'var(--am)':'var(--gr)'}">${fmt(p.stock+p.en_cmd)}</td>
  </tr>`;
  }).join('')||'<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--t3)">Aucune alerte 🎉</td></tr>';
}

// 2. STOCK COMPLET TAB (FUSED DASHBOARD)
function rStocks(){
  const srch = (document.getElementById('s-s')?.value || '').toLowerCase();
  const fourns = gC('fs'), pars = gC('ps'), stats = gC('sts');

  // PHASE 1: Base Filter (Team, Supplier, Search Bar)
  let baseRows = PRODS.filter(p => {
    if (!equipeMatch(p.fourn, p)) return false;
    if (fourns.length && !fourns.includes(p.fourn)) return false;
    
    // 🚀 UPGRADE: Search now looks at both Name and SKU!
    if (srch && !p.nom.toLowerCase().includes(srch) && !(p.skuFourn || '').toLowerCase().includes(srch)) return false;

    // 🚀 NOUVEAU: Exclure les produits à faible rotation (< 1 vente/mois), sauf si le solde reste négatif
    if (estFaibleRotation(p.nom, p.solde)) return false;

    return true;
  });

  // PHASE 2: Calculate KPIs based on the current supplier/search view
  const rupt = baseRows.filter(p => p.statut === 'rupture').length;
  const crit = baseRows.filter(p => p.statut === 'critique').length;
  const ok = baseRows.length - rupt - crit;

  // PHASE 3: Inject the KPI Cards
  document.getElementById('mg-s').innerHTML = `
    <div class="mc" onclick="clearDD('dd-sts','sts',rStocks)"><div class="mcl">Total produits</div><div class="mcv">${fmt(baseRows.length)}</div><div class="mcs">Tout afficher</div></div>
    <div class="mc" onclick="sC('sts',['rupture']);updDD('dd-sts','sts');rStocks()"><div class="mcl">Ruptures</div><div class="mcv r">${fmt(rupt)}</div><div class="mcs">↗ Filtrer</div></div>
    <div class="mc" onclick="sC('sts',['critique']);updDD('dd-sts','sts');rStocks()"><div class="mcl">Critique</div><div class="mcv a">${fmt(crit)}</div><div class="mcs">↗ Filtrer</div></div>
    <div class="mc" onclick="sC('sts',['active']);updDD('dd-sts','sts');rStocks()"><div class="mcl">OK</div><div class="mcv g">${fmt(ok)}</div><div class="mcs">↗ Filtrer</div></div>
  `;

  // PHASE 4: Final Table Filter (Pareto, Status)
  let rows = baseRows.filter(p => {
    if (pars.length && !pars.includes(p.pareto)) return false;
    if (stats.length && !stats.includes(p.statut)) return false;
    return true;
  });

  // Sort and count final rows
  rows = sortProds(rows, SORTS.s.col, SORTS.s.dir);
  document.getElementById('rc-s').textContent = rows.length + ' produit(s)';

  // PHASE 5: Draw the Table
  const now = Date.now(); 
  document.getElementById('tb-s').innerHTML = rows.map(p => { 
    const cleanNom = (p.variante && p.nom.endsWith(' - ' + p.variante)) ? p.nom.slice(0, -(p.variante.length + 3)) : p.nom;
    const enPromo = PROMOS.some(pr => (pr.sku === p.skuFourn || normKey(pr.produit) === normKey(p.nom) || normKey(pr.produit) === normKey(p.nb)) && now >= pr.tsStart && now <= pr.tsEnd);
    const searchKey = p.skuFourn ? p.skuFourn.replace(/'/g,"\\\\'") : p.nom.replace(/'/g,"\\\\'");
    const promoBadge = enPromo ? `<span class="promo-link" title="Voir la promotion" onclick="allerAuxPromos('${searchKey}')">⭐ Promo</span>` : '';

    return `<tr>
    <td><div class="pn">${cleanNom}${promoBadge}</div>${p.variante ? `<div class="pv">${p.variante}</div>` : ''}</td>
    <td style="white-space:nowrap;font-size:12px">${p.fourn || '—'}</td>
    <td>${bP(p.pareto)}</td>
    <td style="text-align:right"><span class="${sc(p.stock)}">${fmt(p.stock)}</span></td>
    <td>${bS(p.statut, p.statut_produit)}</td>
    <td style="text-align:right;font-size:12px">${p.wks_left !== null ? p.wks_left + ' sem.' : '—'}</td>
    <td style="text-align:right">${p.en_cmd > 0 ? `<span class="cmd-link" onclick="allerAuxReceptions('${p.nom.replace(/'/g,"\\\\'")}')">${fmt(p.en_cmd)}</span>` : '—'}</td>
    <td style="text-align:right">${fmt(p.fc_m05)}</td>
    <td style="text-align:right;font-weight:500;color:${p.statut === 'rupture' ? 'var(--re)' : p.statut === 'critique' ? 'var(--am)' : 'var(--gr)'}">${fmt(p.stock + p.en_cmd)}</td>
  </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--t3)">Aucun résultat</td></tr>';
}


// 3. VENTES TAB (Sales Velocity)
function rVentes(){
  const W=cw();
  const srch=(document.getElementById('s-v')?.value||'').toLowerCase();
  const fourns=gC('fv'),pars=gC('pv');

  // Filter out any product that has literally 0 sales in both the current and previous year
  const rowsFiltered=PRODS.filter(p=>{
    if(!equipeMatch(p.fourn, p))
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

  // 🚀 NOUVEAU: Semaine en cours + 4 semaines suivantes (réel pour la semaine en cours, forecast pour toutes)
  const NB_SEM_FUTURES=4;
  const anneeCourante=new Date().getFullYear();
  const dispWks=[];
  for(let i=W;i<=Math.min(52,W+NB_SEM_FUTURES);i++)dispWks.push(i);
  const moisLbl=['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];
  // Forecast hebdo = forecast du mois de la semaine / 4.33
  function fcSemaine(p,sem){
    const m=getMonthFromCompanyWeek(sem,anneeCourante);
    const v=(p.fc_mois&&p.fc_mois[moisLbl[m]])||0;
    return v/4.33;
  }
  function fmtFc(v){
    if(!(v>0))return '—';
    return v<1?v.toLocaleString('fr-CA',{maximumFractionDigits:1}):Math.round(v).toLocaleString('fr-CA');
  }
  document.getElementById('th-v').innerHTML=`<tr>
    <th onclick="srt('v','nom',this)">Produit</th><th onclick="srt('v','fourn',this)">Fournisseur</th><th onclick="srt('v','pareto',this)">Pareto</th>
    ${dispWks.map(i=>`<th style="text-align:right">S${String(i).padStart(2,'0')}${i===W?'<div style="font-size:9px;font-weight:500;opacity:.7">en cours</div>':'<div style="font-size:9px;font-weight:500;opacity:.7">prév.</div>'}</th>`).join('')}
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
    const cleanNom = (p.variante && p.nom.endsWith(' - ' + p.variante)) ? p.nom.slice(0, -(p.variante.length + 3)) : p.nom;
    return`<tr>
      <td><div class="pn">${cleanNom}</div>${p.variante?`<div class="pv">${p.variante}</div>`:''}</td>
      <td style="white-space:nowrap;font-size:12px">${p.fourn||'—'}</td>
      <td>${bP(p.pareto)}</td>
      ${dispWks.map(i=>{
        const fcV=fcSemaine(p,i);
        if(i===W){
          // Semaine en cours : vendu à date + forecast en petit
          const k='S'+String(i).padStart(2,'0');
          const reel=p.sems[k]||0;
          return `<td style="text-align:right"><div style="font-weight:500">${reel>0?fmt(reel):'—'}</div><div style="font-size:10px;color:var(--gr)">prév. ${fmtFc(fcV)}</div></td>`;
        }
        return `<td style="text-align:right;color:var(--gr);font-weight:500">${fmtFc(fcV)}</td>`;
      }).join('')}
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

// 🚀 NOUVEAU: Parse une chaîne de livraison (dd/mm/yy ou texte flou type "Mi-septembre 2027") en objet Date
function parseLivraisonDate(liv) {
  if (!liv || liv === '—' || liv === 'Indéterminé') return null;

  if (liv.includes('/')) {
    const parts = liv.split('/');
    if (parts.length === 3) {
      let y = parseInt(parts[2]);
      if (y < 100) y += 2000;
      const d = new Date(y, parseInt(parts[1]) - 1, parseInt(parts[0]));
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  const cleanLiv = liv.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const moisDict = {
    'janvier': 0, 'janv': 0, 'fevrier': 1, 'fevr': 1, 'mars': 2, 'avril': 3, 'avr': 3,
    'mai': 4, 'juin': 5, 'juillet': 6, 'juil': 6, 'aout': 7, 'septembre': 8, 'sept': 8,
    'octobre': 9, 'oct': 9, 'novembre': 10, 'nov': 10, 'decembre': 11, 'dec': 11
  };
  let moisTrouve = -1;
  for (const [nomMois, idx] of Object.entries(moisDict)) {
    if (cleanLiv.includes(nomMois)) { moisTrouve = idx; break; }
  }
  if (moisTrouve === -1) return null;

  const yearMatch = cleanLiv.match(/20\d{2}/);
  const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
  return new Date(year, moisTrouve, 1);
}

// -----------------------------------------------------------------
// 5. INCOMING SHIPMENTS (Confirmed POs - rReceptions)
// -----------------------------------------------------------------
function rReceptions(){
  const srch=(document.getElementById('s-r')?.value||'').toLowerCase();
  const fourn=document.getElementById('f-r')?.value||'';
  const sw=document.getElementById('sw-r')?.value||'';
  const W=cw();

  // Helper function to filter by target delivery week
  function matchSemaine(c) {
    if (!sw) return true; // "Toutes semaines" always shows everything

    const liv = c.livraison || '';
    const isIndetStrict = liv === '—' || liv === 'Indéterminé';

    // 🚀 NEW: Le Dictionnaire des Mois (Fuzzy Matching Engine)
    const cleanLiv = liv.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    // JS compte de 0 à 11 (Janvier = 0, Décembre = 11)
    const moisDict = {
        'janvier': 0, 'janv': 0,
        'fevrier': 1, 'fevr': 1,
        'mars': 2,
        'avril': 3, 'avr': 3,
        'mai': 4,
        'juin': 5,
        'juillet': 6, 'juil': 6,
        'aout': 7, 
        'septembre': 8, 'sept': 8,
        'octobre': 9, 'oct': 9,
        'novembre': 10, 'nov': 10,
        'decembre': 11, 'dec': 11
    };
    
    let moisTrouve = -1;
    for (const [nomMois, indexMois] of Object.entries(moisDict)) {
        if (cleanLiv.includes(nomMois)) {
            moisTrouve = indexMois;
            break; 
        }
    }

    let isUncalculableText = false;
    let d;
    try {
        if (liv.includes('/')) {
            const parts = liv.split('/');
            d = new Date(parseInt(parts[2]) + 2000, parseInt(parts[1]) - 1, parseInt(parts[0]));
        } else {
            d = new Date(liv);
        }
        if (isNaN(d.getTime())) isUncalculableText = true;
    } catch(e) {
        isUncalculableText = true;
    }

    if (moisTrouve !== -1) {
        isUncalculableText = false;
    }

    if (sw === 'indetermine') {
        return isIndetStrict || isUncalculableText;
    }
    
    if (isIndetStrict || isUncalculableText) return false;

    const selectedWeek = parseInt(sw);
    if (moisTrouve !== -1) {
        // Find which month the selected week belongs to
        const selectedMonth = getMonthFromCompanyWeek(selectedWeek, new Date().getFullYear());
        return selectedMonth === moisTrouve;
    }

    const s = new Date(d.getFullYear(), 0, 1);
    const cmdSw = Math.ceil(((d - s) / 86400000 + s.getDay() + 1) / 7);
    return cmdSw === selectedWeek;
  }

  const showHistory = document.getElementById('cb-history-r')?.checked;

  // 🚀 NEW: Dynamic PO reconstruction based on line statuses AND Color System
  function filtrerCommandes(liste) {
    return liste.map(c => {
        // Step A: Evaluer le statut global du PO AVANT de filtrer
        const allLines = c.lignes;
        const isAllCancelled = allLines.length > 0 && allLines.every(l => l.status === 'Annulé');
        const isAllCompleted = allLines.length > 0 && allLines.every(l => l.status === 'Reçu' || l.status === 'Annulé') && !isAllCancelled;
        const hasReceived = allLines.some(l => l.status === 'Reçu' || (l.status && l.status.toLowerCase().includes('partiel')));
        const isPartiallyReceived = hasReceived && !isAllCompleted && !isAllCancelled;

        // Evaluer si la commande est en retard
        let isLate = false;
        if (!isAllCompleted && !isAllCancelled && c.livraison && c.livraison !== '—' && c.livraison !== 'Indéterminé') {
            const parts = c.livraison.split('/');
            
            // Règle A: Format de date standard (ex: 15/08/26)
            // Règle A: Format de date standard (ex: 15/08/26 ou 15/08/2026)
            if (parts.length === 3) {
                let parsedYear = parseInt(parts[2]);
                // 🚀 FIX: Y2K Future-proofing (If they type 26, it becomes 2026. If they type 2026, it stays 2026)
                let safeYear = parsedYear < 100 ? parsedYear + 2000 : parsedYear; 
                
                const d = new Date(safeYear, parseInt(parts[1]) - 1, parseInt(parts[0]));
                const today = new Date();
                today.setHours(0,0,0,0);
                if (d < today) isLate = true;
            } 
            // Règle B: Date textuelle (ex: "Mi-juillet" ou "Mi-juillet 2027")
            else {
                const cleanLiv = c.livraison.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                const moisDict = {
                    'janvier': 0, 'janv': 0, 'fevrier': 1, 'fevr': 1, 'mars': 2, 'avril': 3, 'avr': 3,
                    'mai': 4, 'juin': 5, 'juillet': 6, 'juil': 6, 'aout': 7, 'septembre': 8, 'sept': 8,
                    'octobre': 9, 'oct': 9, 'novembre': 10, 'nov': 10, 'decembre': 11, 'dec': 11
                };
                
                let moisTrouve = -1;
                for (const [nomMois, indexMois] of Object.entries(moisDict)) {
                    if (cleanLiv.includes(nomMois)) {
                        moisTrouve = indexMois;
                        break; 
                    }
                }
                
                if (moisTrouve !== -1) {
                    const today = new Date();
                    const currentYear = today.getFullYear();
                    const currentMonth = today.getMonth();
                    
                    // 🚀 NOUVEAU : Scanner l'année dans le texte (extrait "2027" de "Mi-septembre 2027")
                    const yearMatch = cleanLiv.match(/20\d{2}/);
                    const targetYear = yearMatch ? parseInt(yearMatch[0]) : currentYear;
                    
                    // Calcul intelligent du retard incluant l'année cible
                    if (targetYear < currentYear) {
                        isLate = true; // L'année prévue est dans le passé
                    } else if (targetYear === currentYear && moisTrouve < currentMonth) {
                        isLate = true; // Même année, mais le mois est dépassé
                    }
                    // Si targetYear > currentYear, la commande n'est mathématiquement pas en retard !
                }
            }
        }

        // Assigner la classe CSS correspondante
        let globalStatusClass = '';
        if (isAllCancelled) globalStatusClass = 'rg-cancelled';
        else if (isAllCompleted) globalStatusClass = 'rg-received';
        else if (isPartiallyReceived) globalStatusClass = 'rg-partiel';
        else if (isLate) globalStatusClass = 'rg-late';

        // Step B: Filter out completed lines if history is toggled off
        const lignesValides = c.lignes.filter(l => {
            if (!equipeMatch(c.fourn, l)) return false; // 🚀 NOUVEAU: tri des lignes par équipe (Technique)
            if (!showHistory && (l.status === 'Reçu' || l.status === 'Annulé')) return false;
            if (srch && !l.nom.toLowerCase().includes(srch)) return false;
            return true;
        });
        
        // Step C: Recalculate the PO's total units using only the visible lines
        const nouveauTotal = lignesValides.reduce((sum, l) => sum + (l.qty || 0), 0);
        
        return { ...c, lignes: lignesValides, total: nouveauTotal, _statusClass: globalStatusClass, _isHistorical: isAllCompleted || isAllCancelled, _isLate: isLate };
    }).filter(c => {
        // Step D: Drop the entire PO if all its lines were filtered out
        // (le filtre d'équipe est désormais appliqué ligne par ligne au Step B)
        if (c.lignes.length === 0) return false; 
        if (fourn && c.fourn !== fourn) return false;
        return matchSemaine(c);
    });
  }

  // 1. Filter the Stocky Orders
  const sf = filtrerCommandes(STOCKY);

  // 2. Filter the Transferts Orders
  const tf = filtrerCommandes(TRANSFERTS);

  // 3. Update the total order count at the top of the screen
  document.getElementById('rc-r2').textContent=(sf.length+tf.length)+' commande(s)';

  // 🚀 NOUVEAU: Compare deux commandes sur le critère "date" (retards en premier, puis date croissante)
  function compareDate(a, b) {
    if (a._isLate !== b._isLate) return b._isLate - a._isLate;
    const da = parseLivraisonDate(a.livraison), db = parseLivraisonDate(b.livraison);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  }

  // 🚀 NOUVEAU: Compare deux commandes sur le critère "fourn" (alphabétique)
  function compareFourn(a, b) {
    return (a.fourn || '').localeCompare(b.fourn || '', 'fr', { sensitivity: 'base' });
  }

  // 🚀 NOUVEAU: Trie une liste selon SORT_MODE_R — applique le 1er critère, puis le 2e en cas d'égalité
  function trierListe(list) {
    const arr = [...list];
    arr.sort((a, b) => {
      for (const key of SORT_MODE_R) {
        const cmp = key === 'fourn' ? compareFourn(a, b) : compareDate(a, b);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
    return arr;
  }

  // 4. Helper function to generate the HTML for a specific group of orders
  // 4. Helper function to generate the HTML for a specific group of orders
  function renderGroupe(list, titre, prefix){
    if(!list.length)return '';
    const sortedList = trierListe(list);
    let h=`<div class="sh"><span class="st">${titre} (${sortedList.length})</span></div>`;
    h+=sortedList.map((c,i)=>{
      // 🚀 NEW: Auto-collapse if historical, even during searches
      const shouldOpen = srch.length > 0 && !c._isHistorical;
      const openCls = shouldOpen ? 'open' : '';
      const arrow = shouldOpen ? '▲' : '▼';
      
      // 🚀 NEW: Clean up the # symbol and dynamically name it
      const cleanCmd = String(c.cmd).replace(/^#/, '');
      const typeLabel = prefix === 'S' ? 'PO' : 'Transfert';
      
      // 🚀 NEW: Add old date styling if it exists
      const oldDateHtml = c.livraison_originale ? `<span style="text-decoration:line-through; opacity:0.6; margin-left:5px; font-size:10px;">(${c.livraison_originale})</span>` : '';

      return`
      <div class="rg ${c._statusClass || ''}">
        <div class="rh" onclick="toggleRec('rb${prefix}${i}','arr${prefix}${i}')" style="display:flex; align-items:center; gap:12px;">
          <div style="flex:1; min-width:0;">
            <div class="pn">${c.fourn}</div>
            <div class="pv">${typeLabel} #${cleanCmd} · ${c.lignes.length} produit(s) · ${fmt(c.total)} unités</div>
          </div>
          <div style="text-align:right; white-space:nowrap;">
            <div style="font-size:13px; font-weight:500; color:${c._isLate?'var(--re)':'var(--t1)'};">📅 ${c.livraison}${oldDateHtml}</div>
            ${c._isLate ? '<div style="font-size:11px;color:var(--re);font-weight:600;margin-top:2px">⚠ En retard</div>' : ''}
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
              <!-- 🚀 NEW: The Duplication Button (masqué en vue Technique : il ouvre la commande manuelle) -->
              ${EQUIPE_FILTER === 'technique' ? '' : `<button class="fb" style="padding:2px 8px; font-size:10px;" onclick="event.stopPropagation(); dupliquerCommande('${c.cmd}', '${c.fourn.replace(/'/g,"\\\\'")}', '${prefix}')">📄 Dupliquer</button>`}
              <span id="arr${prefix}${i}">${arrow}</span>
          </div>
        </div>
        <div class="rb ${openCls}" id="rb${prefix}${i}">
          <table style="width:100%">
            <thead><tr><th>Produit</th><th>Variante</th><th style="text-align:right">Qté</th></tr></thead>
            <tbody>${c.lignes.map(l=>{
              const vStr = l.variante && l.variante !== 'Default Title' ? l.variante : '';
              const cleanNom = (vStr && l.nom.endsWith(' - ' + vStr)) ? l.nom.slice(0, -(vStr.length + 3)) : l.nom;
              return `<tr>
              <td>
                ${cleanNom}
${l.com?`<div style="font-size:11px;color:var(--am);margin-top:3px">💬 ${l.com}</div>`:''}
</td>
              <td style="color:var(--t3);font-size:12px">${vStr||'—'}</td>
              <td style="text-align:right;font-weight:500">${fmt(l.qty)}</td>
            </tr>`;
            }).join('')}</tbody>
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

// ==========================================================
// 🚀 DUPLIQUER UN TRANSFERT / PO EXISTANT
// ==========================================================
function dupliquerCommande(cmdId, fourn, prefix) {
    // 1. Find the original order in the memory buckets
    const sourceArray = prefix === 'S' ? STOCKY : TRANSFERTS;
    const originalOrder = sourceArray.find(c => String(c.cmd) === String(cmdId) && c.fourn === fourn);
    
    if (!originalOrder) {
        alert("Erreur : Commande originale introuvable.");
        return;
    }
    
    // 2. Open the Manual Order Modal
    if (ouvrirCommandeManuelle() === false) return;
    
    // 3. Auto-fill the supplier
    document.getElementById('mc-fourn').value = fourn;
    
    // 4. Auto-add all the original lines
    originalOrder.lignes.forEach(l => {
        const pMatch = PRODS.find(p => p.idVariante === l.idVariante || (p.nom === l.nom && p.variante === l.variante));
        
        if (pMatch) {
            MANUAL_LINES.push({ 
                idVariante: pMatch.idVariante, 
                nom: pMatch.nom, 
                variante: pMatch.variante || '', 
                quantite: l.qty 
            });
        } else if (l.idVariante) {
            MANUAL_LINES.push({ 
                idVariante: l.idVariante, 
                nom: l.nom, 
                variante: l.variante || '', 
                quantite: l.qty 
            });
        }
    });
    
    // 5. Instantly draw the copied lines into the UI!
    renderLignesManuelles();
}

// ==========================================================
// LOGIQUE DE CONFIRMATION ET MASQUAGE PO
// ==========================================================
function cacherDuplicatePO(fourn, idVariante) {
    if(!PO_HIDDEN_DUPLICATES[fourn]) PO_HIDDEN_DUPLICATES[fourn] = [];
    if(!PO_HIDDEN_DUPLICATES[fourn].includes(idVariante)){
        PO_HIDDEN_DUPLICATES[fourn].push(idVariante);
    }
    rPO();
}

let CONFIRM_PO_CTX = null;

function ouvrirConfirmPO(idx, semaines) {
    const sems = Array.isArray(semaines) ? semaines : [semaines];
    const grp = window.PO_GROUPES && window.PO_GROUPES[idx];
    if(!grp) return;
    const [fourn, prods] = grp;

    const lignes = prods.map(r => {
        const p = PRODS.find(x => x.nom === r.nom);
        return {
            idVariante: r._custom ? r.customId : (r.idVariante || (p ? p.idVariante : '')), // 🚀 Grabs custom IDs safely
            quantite: sems.reduce((s, sw) => s + (r.sems[sw] || 0), 0),
            nom: r.nom,
            variante: r._custom ? r.variante : (p && p.variante ? p.variante : ''), // 🚀 NEW: Captures custom variant for the pop-up
            sku: p && p.skuFourn ? p.skuFourn : '',
            prix: r.prix || 0
        };
    }).filter(l => l.idVariante && l.quantite > 0);

    if(!lignes.length){
        alert('Veuillez ajouter des quantités valides avant de créer la commande.');
        return;
    }

    const dejaEnvoyes = PO_ENVOYES[fourn] || [];
    const idVEnvoyes = new Set(dejaEnvoyes.flatMap(e => e.lignes.map(l => l.idVariante)));
    const doubles = lignes.filter(l => idVEnvoyes.has(l.idVariante));

    let alertHtml = '';
    if (doubles.length > 0) {
        alertHtml = `<div style="background:var(--reb);color:var(--re);padding:10px;border-radius:6px;margin-bottom:14px;font-size:12px;font-weight:600;line-height:1.4;">
        ⚠️ Attention : Certains produits sélectionnés existent déjà dans une commande en cours pour ce fournisseur. Confirmez-vous cette double commande ?
        </div>`;
    }

    SKU_OVERRIDE_TEMP = {}; // 🚀 NEW: Wipes memory clean every time you open the modal
    TECH_INFO_TEMP = {};    // 🚀 NOUVEAU: idem pour les infos Technique

    let totalCost = 0;
    const lignesHtml = lignes.map(l => {
        const lineTotal = l.quantite * l.prix;
        totalCost += lineTotal;
        const cleanNom = (l.variante && l.nom.endsWith(' - ' + l.variante)) ? l.nom.slice(0, -(l.variante.length + 3)) : l.nom;
        
        // 🚀 NEW: Added the editable SKU input
        return `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--b1); font-size:12px;">
            <div style="flex:1; padding-right: 15px;">
                <div style="font-weight:500;">${cleanNom}</div>
                <div style="color:var(--t3); font-size:11px;">${l.variante || ''}</div>
                <div style="margin-top: 4px; display:flex; align-items:center; gap:6px;">
                    <span style="color:var(--t3); font-size:10px;">SKU:</span>
                    <input type="text" value="${l.sku}" oninput="SKU_OVERRIDE_TEMP['${l.idVariante}'] = this.value" style="padding:2px 4px; border:1px solid var(--b2); border-radius:4px; font-size:11px; width:120px;" title="Modification temporaire pour le PDF">
                </div>
                ${EQUIPE_FILTER === 'technique' ? `
                <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
                    <input type="text" placeholder="N° commande client" oninput="majInfoTechTemp('${l.idVariante}','cmdClient',this.value)" style="padding:3px 6px; border:1px solid var(--b2); border-radius:4px; font-size:11px; width:130px;">
                    <input type="text" placeholder="Machine / moulin / accessoire" oninput="majInfoTechTemp('${l.idVariante}','machine',this.value)" style="padding:3px 6px; border:1px solid var(--b2); border-radius:4px; font-size:11px; width:200px;">
                    <input type="text" placeholder="N° de série" oninput="majInfoTechTemp('${l.idVariante}','serie',this.value)" style="padding:3px 6px; border:1px solid var(--b2); border-radius:4px; font-size:11px; width:130px;">
                </div>` : ''}
            </div>
            <div style="text-align:right;">
                <div style="font-weight:600;">${fmt(l.quantite)} unités</div>
                <div style="color:var(--t2); font-size:11px;">${fmtM(lineTotal)}</div>
            </div>
        </div>`;
    }).join('');

    document.getElementById('cpo-title').textContent = `Confirmer la commande — ${fourn}`;
    document.getElementById('cpo-lignes').innerHTML = alertHtml + lignesHtml;
    document.getElementById('cpo-total').textContent = `Total : ${fmtM(totalCost)}`;

    // 🚀 NEW: Clear previous dates and notes
    document.getElementById('cpo-date').value = '';
    document.getElementById('cpo-note').value = '';

    CONFIRM_PO_CTX = { idx, semaines };
    document.getElementById('modal-confirm-po').style.display = 'flex';
}

function fermerConfirmPO() {
    document.getElementById('modal-confirm-po').style.display = 'none';
    CONFIRM_PO_CTX = null;
}

function validerConfirmPO() {
    if (!CONFIRM_PO_CTX) return;
    const { idx, semaines } = CONFIRM_PO_CTX;
    fermerConfirmPO();
    envoyerCommandeFournisseur(idx, semaines); // Déclenche le vrai payload
}

// 🚀 NEW: Generate a Draft PDF directly from the confirmation modal
function telechargerPDFConfirmPO() {
    if (!CONFIRM_PO_CTX) return;
    const { idx, semaines } = CONFIRM_PO_CTX;
    const sems = Array.isArray(semaines) ? semaines : [semaines];
    const grp = window.PO_GROUPES[idx];
    if(!grp) return;
    
    const [fourn, prods] = grp;

    const lignes = prods.map(r => {
        const p = PRODS.find(x => x.nom === r.nom);
        const targetId = r._custom ? r.customId : (r.idVariante || (p ? p.idVariante : ''));
        return {
            nom: r.nom,
            variante: r._custom ? r.variante : (p && p.variante ? p.variante : ''),
            sku: SKU_OVERRIDE_TEMP[targetId] !== undefined ? SKU_OVERRIDE_TEMP[targetId] : (p && p.skuFourn ? p.skuFourn : ''),
            qte: sems.reduce((s, sw) => s + (r.sems[sw] || 0), 0),
            prix: r.prix || 0,
            ...infoTech(targetId) // 🚀 NOUVEAU: infos Technique
        };
    }).filter(l => l.qte > 0);

    const rawDate = document.getElementById('cpo-date').value;
    const dateFmt = rawDate 
        ? new Date(rawDate + 'T00:00:00').toLocaleDateString('fr-CA', {day:'numeric', month:'long', year:'numeric'}) 
        : '-';

    ouvrirDocumentPO(fourn, "Brouillon", dateFmt, lignes);
}

// -----------------------------------------------------------------
// 7. PURCHASE ORDERS BUILDER (rPO)
// -----------------------------------------------------------------
// This tab calculates exactly what needs to be ordered *this week* // based on the automated forecast, generating a ready-to-order list.

function rPO(){
  const W=cw();

  // 🚀 NOUVEAU: Pas de commande manuelle en vue Technique (bouton masqué)
  const btnCmdManuelle=document.querySelector('#v-po button[onclick="ouvrirCommandeManuelle()"]');
  if(btnCmdManuelle) btnCmdManuelle.style.display = EQUIPE_FILTER==='technique' ? 'none' : '';
  let semaines=gC('swpo').map(Number).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
  if(!semaines.length)semaines=[W];
  const swRef=semaines[0]; // semaine de référence pour les ajouts manuels/personnalisés
  const fpo=document.getElementById('f-po');
  const currentFourn=fpo?.value||'';
  const lblSem=semaines.length>1?('S'+String(semaines[0]).padStart(2,'0')+'–S'+String(semaines[semaines.length-1]).padStart(2,'0')):('S'+String(semaines[0]).padStart(2,'0'));
  
  if(fpo){
    const fournsAvecPO=Object.keys(PO_ENVOYES).filter(f2=>equipeMatch(f2)&&(PO_ENVOYES[f2]||[]).some(e=>e.lignes.some(l=>l.quantite>0)));
    const activeFourns=[...new Set([...PREVISION.filter(r=>semaines.some(sw=>r.sems[sw]>0)&&equipeMatch(r.fourn, r)).map(r=>r.fourn).filter(Boolean),...fournsAvecPO])].sort();
    
    // 🚀 THE FIX: Fetch everyone else to make sure no brand is ever hidden
    const autresFourns=FOURNISSEURS.filter(f=>equipeMatch(f) && !activeFourns.includes(f)).sort();
    
    fpo.innerHTML='<option value="">Tous les fournisseurs</option>' +
      '<optgroup label="Actifs ('+lblSem+')">' + activeFourns.map(f=>`<option${f===currentFourn?' selected':''}>${f}</option>`).join('') + '</optgroup>' +
      '<optgroup label="Autres fournisseurs">' + autresFourns.map(f=>`<option${f===currentFourn?' selected':''}>${f}</option>`).join('') + '</optgroup>';
  }
  const fourn=fpo?.value||'';

  const rowsCalc=PREVISION.filter(r=>{
    if(!equipeMatch(r.fourn, r))return false;
    if (fourn && r.fourn !== fourn && r.fourn !== fourn + ' (Café)') return false;
    
    // Ignore "ghost" spreadsheet rows
    if(!r.idVariante) return false;

    // 🚀 NOUVEAU: Exclure les produits kit (gérés par l'app Bundle)
    if (KIT_IDS.has(r.idVariante)) return false;

    // 🚀 NEW FIX: Exclusion List for non-physical/bundled items
    const lowerName = r.nom.toLowerCase();
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
        lowerName.includes("à vendre en boutique") ||
        lowerName.includes("tasting pack") ||       // NOUVEAU : Exclut les packs dégustation
        lowerName.includes("3 x 1kg");

    if (isExcluded) return false;

    // 🚀 NOUVEAU: Masquer les produits Smeg et Pavoni dans Construire un PO
    if (estFournisseurExclu(r.fourn)) return false;
    
    // NEW RULE: Check if the user manually hid this forecast item
    if(PO_IGNORED[r.fourn] && PO_IGNORED[r.fourn].includes(r.idVariante)) return false;
    
    // 🚀 NOUVEAU FILTRE : Exclure les faibles rotations (< 1 vente/mois) sauf si en rupture
    const pMatch = PRODS.find(x => x.idVariante === r.idVariante || x.nom === r.nom);
    const fMatch = FORECAST.find(x => x.nom === r.nom);
    
    let forecastAnnuel = 0;
    if (fMatch) {
        // Calcul du forecast total sur l'année
        forecastAnnuel = (fMatch.M01||0) + (fMatch.M02||0) + (fMatch.M03||0) + (fMatch.M04||0) + 
                         (fMatch.M05||0) + (fMatch.M06||0) + (fMatch.M07||0) + (fMatch.M08||0) + 
                         (fMatch.M09||0) + (fMatch.M10||0) + (fMatch.M11||0) + (fMatch.M12||0);
    }
    
    const currentStock = pMatch ? pMatch.stock : 0;
    
    // Rejeter si le produit se vend moins de 1 fois par mois (total < 12) 
    // ET qu'il n'est pas strictement en rupture de stock (< 0)
    if (forecastAnnuel < 12 && currentStock >= 0) {
        return false;
    }

    return semaines.some(sw=>r.sems[sw]>0);
  });
  
  // Fusion des ajouts manuels (ruptures/critiques ajoutées depuis la bulle)
  const rowsExtra=[];
  Object.entries(PO_EXTRAS).forEach(([f,lignes])=>{
    if (fourn && f !== fourn && f !== fourn + ' (Café)') return;
    lignes.forEach(l=>{
      if(!equipeMatch(f, l))return; // 🚀 NOUVEAU: filtre par produit (Technique)
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
    if (fourn && f !== fourn && f !== fourn + ' (Café)') return;
    lignes.forEach(cu=>{
      if(!(cu.quantite>0))return;
      // 🚀 NEW: Add "variante: cu.variante"
      rowsCustom.push({nom:cu.nom, variante: cu.variante || '', fourn:f,cat:'C',delai:DELAIS_MAP[f]||0,
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
  // 🚀 FIX: Le budget semaine utilise désormais le même total filtré que le reste de l'onglet
  // (avant, il venait de BUDGET/PREVISION brut, sans les exclusions kits/faible rotation/Smeg-Pavoni)
  const budgetVal=total_montant;
  
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
  // Ruptures/critiques hors de ce PO, groupées par fournisseur
  // 🚀 FIX: Prevent items already in POs from duplicating in the yellow box
  const nomsDejaPO=new Set([
      ...rows.map(r=>r.nom),
      ...Object.keys(PO_ENVOYES).flatMap(f2 => (PO_ENVOYES[f2]||[]).flatMap(e => e.lignes.map(l => l.nom)))
  ]);

  const horsPO=PRODS.filter(p=>{
    if(!(p.statut==='rupture'||p.statut==='critique'))return false;
    if(!(p.demande_cumulee>0))return false;
    if(!equipeMatch(p.fourn, p))return false;
    if(estTechnique(p) && EQUIPE_FILTER!=='technique')return false; // 🚀 NOUVEAU: pièces seulement en vue Technique
    if (fourn && p.fourn !== fourn && p.fourn !== fourn + ' (Café)') return false;
    if(nomsDejaPO.has(p.nom))return false;
    if(p.en_cmd>0&&(p.stock+p.en_cmd)>=p.demande_cumulee)return false;

    // 🚀 NEW FIX: Exclusion List for the yellow box
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
        lowerName.includes("à vendre en boutique") ||
        lowerName.includes("tasting pack") ||       // NOUVEAU : Exclut les packs dégustation
        lowerName.includes("3 x 1kg");

    if (isExcluded) return false;

    // 🚀 NOUVEAU: Masquer les produits Smeg et Pavoni seulement en critique (rupture reste visible)
    if (p.statut === 'critique' && estFournisseurExclu(p.fourn)) return false;

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
        
        // 🚀 AESTHETIC FIX: Slice off the duplicate variant from the main name
        const cleanNom = (p.variante && p.nom.endsWith(' - ' + p.variante)) ? p.nom.slice(0, -(p.variante.length + 3)) : p.nom;
        
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;border-bottom:1px dashed rgba(0,0,0,0.05)">
          <div style="flex:1; line-height:1.3;">
            <div style="font-weight:500;">${cleanNom} <span style="color:${p.statut==='rupture'?'var(--re)':'var(--am)'}; font-size:10px; font-weight:600; margin-left:6px;">(${p.statut})</span></div>
            ${p.variante ? `<div style="font-size:11px; color:var(--t3);">${p.variante}</div>` : ''}
          </div>
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
      <!-- 🚀 FIXED: Changed z-index from 5 to 50 to fly over table headers -->
      <div id="search-res-${blocId}" style="display:none;position:absolute;z-index:50;background:var(--w);border:1px solid var(--b2);border-radius:6px;width:100%;max-height:220px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.08)"></div>
    </div>`;
  }

  function renderAjoutPersonnalise(f,blocId){
    const fSafe=f.replace(/'/g,"\\\\'");
    // 🚀 NOUVEAU: En vue Technique, le produit personnalisé est créé dans Shopify (voir renderCreationTechnique)
    if (EQUIPE_FILTER === 'technique') return renderCreationTechnique(fSafe, blocId);
    return `<div style="margin-top:8px;display:flex;gap:6px;align-items:center">
      <input type="text" placeholder="Nom du produit personnalisé…" id="cust-nom-${blocId}"
        style="flex:1.5;padding:6px 8px;border:1px solid var(--b2);border-radius:6px;font-size:12px">
      <!-- 🚀 NEW: Variant Input Box -->
      <input type="text" placeholder="Variante (opt.)" id="cust-var-${blocId}"
        style="flex:1;padding:6px 8px;border:1px solid var(--b2);border-radius:6px;font-size:12px">
      <input type="number" min="0" step="0.01" placeholder="Prix unit." id="cust-prix-${blocId}"
        style="width:80px;padding:6px 8px;border:1px solid var(--b2);border-radius:6px;font-size:12px;text-align:right">
      <input type="number" min="1" step="1" value="1" placeholder="Qté" id="cust-qte-${blocId}"
        style="width:60px;padding:6px 8px;border:1px solid var(--b2);border-radius:6px;font-size:12px;text-align:center">
      <button class="fb" style="padding:6px 12px;font-size:12px" onclick="ajouterProduitPersonnalise('${fSafe}','${blocId}')">+ Produit personnalisé</button>
    </div>`;
  }

  const aDesPOEnvoyesVisibles = Object.keys(PO_ENVOYES).some(f2=>equipeMatch(f2)&&(!fourn||f2===fourn)&&(PO_ENVOYES[f2]||[]).some(e=>e.lignes.some(l=>l.quantite>0)));
  
  // 🚀 FIXED: Only abort if no supplier is explicitly selected. Otherwise, render a blank builder!
  if(!fourn && !rows.length && !Object.keys(byFournHP).length && !aDesPOEnvoyesVisibles){
      document.getElementById('po-cont').innerHTML='<div style="text-align:center;padding:50px;color:var(--t3)">Aucune prévision pour cette période</div>';
      return;
  }
  
  const minW=semaines[0],maxW=semaines[semaines.length-1];
  const wks=[];for(let i=minW;i<=Math.min(52,maxW+2);i++)wks.push(i);
  const byF={};
  rows.forEach(r=>{if(!byF[r.fourn])byF[r.fourn]=[];byF[r.fourn].push(r);});
  
  // 🚀 FIXED: Force the selected supplier into the render loop even if they have 0 stock needs
  let tousFourns=[...new Set([...Object.keys(byF),...Object.keys(byFournHP)])];
  if (fourn && !tousFourns.includes(fourn)) tousFourns.push(fourn);
  tousFourns.sort((a,b)=>a.localeCompare(b));
  let html='';
  
  // 🚀 FIX: Update PO_GROUPES to include ALL suppliers (even if they only have yellow box items)
  window.PO_GROUPES = tousFourns.map(f => [f, byF[f] || []]);
  window.PO_SEMAINES=semaines;

  tousFourns.forEach((f,blocIdx)=>{
    const prods = byF[f] || []; 
    const idx = blocIdx; 
    
    const dejaEnvoyesCheck = (PO_ENVOYES[f]||[]).some(e=>e.lignes.some(l=>l.quantite>0));
if(prods.length > 0 || (byFournHP[f] && byFournHP[f].length > 0) || dejaEnvoyesCheck){
      const dejaEnvoyes=PO_ENVOYES[f]||[];
      const idVEnvoyes=idVEnvoyesFor(f);
      
      const prodsNonCommandes = prods; 
      
      const fm=prodsNonCommandes.reduce((s,r)=>s+(qtySel(r)*(r.prix||0)),0);
      const aEnvoyer=prodsNonCommandes.length;
      
      // 🚀 PRÉPARATION ACCORDION
      const fSafe2 = f.replace(/'/g,"\\\\'");
      const isCollapsed = PO_TOGGLE_STATE[f] === true;
      const arrow = isCollapsed ? '▶' : '▼';
      const displayStyle = isCollapsed ? 'none' : 'block';

      let dropdownHtml = '';
      if(dejaEnvoyes.length) {
        dropdownHtml = `
          <div style="display:inline-flex; align-items:center; background:var(--grb); border:1px solid var(--gr); border-radius:6px; padding:2px;">
            <select id="sel-po-${idx}" style="background:transparent; border:none; font-size:12px; color:var(--gr); font-weight:600; outline:none; cursor:pointer; padding:4px;">
              <option value="" disabled selected>PO envoyés (${dejaEnvoyes.length})</option>
              ${dejaEnvoyes.map(e => `<option value="${e.poNumber}">${e.poNumber}</option>`).join('')}
            </select>
            <button class="rbtn" onclick="const v=document.getElementById('sel-po-${idx}').value; if(v) ouvrirModifPO('${fSafe2}', v)" style="margin-left:4px; color:var(--gr); border:none; padding:4px 8px; font-weight:600;" title="Modifier le PO sélectionné">✏️ Modifier</button>
            <button class="rbtn" onclick="const v=document.getElementById('sel-po-${idx}').value; if(v) telechargerPDFUnPO('${fSafe2}', v)" style="margin-left:4px; color:var(--gr); border:none; border-left:1px solid var(--gr); border-radius:0; padding:4px 8px; font-weight:600;" title="Télécharger le PDF du PO sélectionné">📄 PDF</button>
            ${EQUIPE_FILTER === 'technique' ? `<button class="rbtn" onclick="const v=document.getElementById('sel-po-${idx}').value; if(v) preparerCourrielTechnique('${fSafe2}', v)" style="margin-left:4px; color:var(--gr); border:none; border-left:1px solid var(--gr); border-radius:0; padding:4px 8px; font-weight:600;" title="Préparer le courriel au fournisseur dans tech@ (PDF joint)">✉️ Courriel</button>` : ''}
          </div>
        `;
      }

      // NOUVEAU : Préparation des variables pour le tri
      prodsNonCommandes.forEach(r => {
          const p = PRODS.find(x => x.nom === r.nom);
          r._stock = p ? p.stock : 0;
          r._enCmd = p ? p.en_cmd : 0; // 🚀 NEW: Captures active transfers for sorting
          r._qtySel = qtySel(r);
          r._montant = r._qtySel * (r.prix || 0);
      });
      // Exécution du tri
      const sortedProds = sortProds([...prodsNonCommandes], SORTS.po.col, SORTS.po.dir);

      html+=`<div style="margin-bottom:16px; border:1px solid var(--b2); border-radius:8px; padding:12px; background:var(--w);">
        
        <!-- HEADER CLIQUABLE -->
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;" onclick="togglePOBlock('${fSafe2}', ${idx})">
            <span id="po-arr-${idx}" style="font-size:12px; color:var(--t3); width:12px; text-align:center;">${arrow}</span>
            <span style="font-weight:600; font-size:14px; color:var(--t1)">${f}</span>
            <span style="font-size:12px; color:var(--t3); margin-left:4px;">${aEnvoyer} produit(s) à commander</span>
            ${fm > 0 ? `<span style="margin-left:auto; font-weight:600; color:var(--br); margin-right:12px;">${fmtM(fm)}</span>` : ''}
          </div>
          
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="date" id="date-po-${idx}" style="padding:5px 8px; border:1px solid var(--b2); border-radius:6px; font-size:12px; font-family:'Inter', sans-serif" title="Date de livraison (optionnel)" onclick="event.stopPropagation()">
            ${dropdownHtml}
            ${aEnvoyer > 0 ? `<button class="fb" id="btn-po-${idx}" onclick="ouvrirConfirmPO(${idx},[${semaines.join(',')}])">Créer la commande</button>` : ''}
          </div>
        </div>
        
        <!-- CORPS COLLAPSIBLE -->
        <div id="po-body-${idx}" style="display:${displayStyle}; margin-top:12px; padding-top:12px; border-top:1px solid var(--b1);">
          ${aEnvoyer > 0 ? `
          <div class="tw"><table>
            <thead><tr>
              <th onclick="srt('po','nom',this)">Produit</th>
              <th onclick="srt('po','cat',this)">Cat.</th>
              <th style="text-align:right" onclick="srt('po','_stock',this)">Stock actuel</th>
              <th onclick="srt('po','delai',this)">Délai</th>
              ${wks.map(i=>`<th style="text-align:center">S${String(i).padStart(2,'0')}${semaines.includes(i)?' ✎':''}</th>`).join('')}
              <th style="text-align:right" onclick="srt('po','_enCmd',this)">En commande</th>
              <th style="text-align:center">Sem. couvertes</th>
              <th style="text-align:right" onclick="srt('po','prix',this)">Coût unit.</th>
              <th style="text-align:right" onclick="srt('po','_montant',this)">Montant</th>
            </tr></thead>
            <tbody>${sortedProds.map(r=>{
              const fournSafe=(r.fourn||'').replace(/'/g,"\\\\'");
              const idSafe=(r.idVariante||'').replace(/'/g,"\\\\'");
              const nomSafe=r.nom.replace(/'/g,"\\\\'");
              const special=r._manuel||r._custom;
              return `<tr${special?' style="background:var(--amb)"':''}>
              <td>
                ${(()=>{
                    // 🚀 NEW: Explicitly print custom names and variants
                    if (r._custom) {
                        return `<div class="pn">${r.nom}</div>${r.variante ? `<div class="pv">${r.variante}</div>` : ''}`;
                    }
                    const p = PRODS.find(x => x.nom === r.nom);
                    const cleanNom = (p && p.variante && r.nom.endsWith(' - ' + p.variante)) ? r.nom.slice(0, -(p.variante.length + 3)) : r.nom;
                    return `<div class="pn">${cleanNom}</div>${p && p.variante ? `<div class="pv">${p.variante}</div>` : ''}`;
                })()}
                <div style="margin-top: 3px; display: block;">
                  ${(()=>{
                      const existingPOs = (PO_ENVOYES[f] || []).filter(e => e.lignes.some(l => l.idVariante === idSafe)).map(e => e.poNumber);
                      
                      if (existingPOs.length > 0) {
                          return `<div style="color:var(--am); font-size:10px; font-weight:bold; margin-bottom:4px;">⚠️ Déjà dans PO: ${existingPOs.join(', ')} <a href="#" onclick="ignorerForecast('${fournSafe}','${idSafe}');return false;" style="color:var(--re);text-decoration:underline;margin-left:4px;font-weight:normal;">retirer</a></div>`;
                      } else if (r._manuel) {
                          return `<span style="font-size:10px;color:var(--am);font-weight:600">(ajout manuel) <a href="#" onclick="retirerExtra('${fournSafe}','${idSafe}');return false;" style="color:var(--re);text-decoration:underline">retirer</a></span>`;
                      } else if (r._custom) {
                          return `<span style="font-size:10px;color:var(--am);font-weight:600">(produit personnalisé) <a href="#" onclick="retirerCustom('${fournSafe}','${r.customId}');return false;" style="color:var(--re);text-decoration:underline">retirer</a></span>`;
                      } else {
                          return `<span style="font-size:10px;color:var(--t3);font-weight:600">(Ajout Forecast) <a href="#" onclick="ignorerForecast('${fournSafe}','${idSafe}');return false;" style="color:var(--re);text-decoration:underline">retirer</a></span>`;
                      }
                  })()}
                </div>
              </td>
              <td>${bP(r.cat)}</td>
              <td style="text-align:right">${(()=>{const p=PRODS.find(x=>x.nom===r.nom);return p?`<span class="${sc(p.stock)}">${fmt(p.stock)}</span>`:'—';})()}</td>
              <td style="text-align:center;font-size:12px">${r.delai>0?r.delai+' sem.':'—'}</td>
              ${wks.map(i=>{
                if(semaines.includes(i)){
                  const val=r.sems[i]||0;
                  const style=special?'border:1px solid var(--am)':'border:1px solid var(--b2)';
                  const tipo=r._custom?'custom':(r._manuel?'manuel':'normal');
                  
                  const moq = MOQ_MAP[idSafe] || 1; 
                  let validationBadge = '';
                  let moqBadge = moq > 1 
                      ? `<div style="background:var(--amb); color:var(--am); padding:2px 4px; border-radius:4px; font-size:9px; font-weight:bold; margin-top:4px; display:inline-block;">📦 Lot de ${moq}</div>` 
                      : `<div style="color:var(--t3); font-size:9px; font-weight:600; margin-top:4px;">Pas de min.</div>`;
                  
                  if (moq > 1 && val > 0) {
                      if (val % moq === 0) {
                          validationBadge = `<div style="color:var(--gr); font-size:10px; font-weight:bold; margin-top:4px;">✅ OK</div>`;
                      } else {
                          validationBadge = `<div style="color:var(--re); font-size:10px; font-weight:bold; margin-top:4px;">⚠️ Invalide</div>`;
                      }
                  }
                  
                  const stepVal = moq > 1 ? moq : '1';
                  return `<td style="text-align:center; vertical-align:top; padding-top:8px;">
                      <input type="number" min="0" step="${stepVal}" value="${val}" style="width:50px;padding:2px 4px;${style};border-radius:4px;font-size:12px;text-align:center" onchange="majQuantitePO('${fournSafe}','${idSafe}','${nomSafe}',${i},this.value,'${tipo}','${r.customId||''}')">
                      <div style="display:flex; flex-direction:column; align-items:center;">
                          ${moqBadge}
                          ${validationBadge}
                      </div>
                  </td>`;
                }
                if(special)return `<td style="text-align:center;color:var(--t3)">—</td>`;
                const v=r.sems[i]||0;
                return v>0?`<td style="text-align:center;background:var(--amb);color:var(--am);font-weight:600;font-size:12px;padding:8px 10px">${fmt(v)}</td>`:
                           `<td style="text-align:center;color:var(--t3)">—</td>`;
              }).join('')}
              <td style="text-align:right;font-weight:500">${(()=>{const p=PRODS.find(x=>x.nom===r.nom); return (p&&p.en_cmd>0)?`<span class="cmd-link" title="Voir les transferts" onclick="allerAuxReceptions('${p.nom.replace(/'/g,"\\\\'")}')">${fmt(p.en_cmd)}</span>`:'—';})()}</td>
              <td style="text-align:center">${(()=>{
    const qty=qtySel(r);
    const p=PRODS.find(x=>x.nom===r.nom);
    const stockAct=p?p.stock:0;
    const enCmd=p?(p.en_cmd||0):0;
    
    // 🚀 NEW: Prioritize Forecast Demand over Historical Sales
    const forecastMensuel = p ? p.fc_m05 : 0;
    const weeklyDemand = forecastMensuel > 0 ? (forecastMensuel / 4.33) : (r.vm || 0);

    if(qty>0 && weeklyDemand>0){
        const wksCov=Math.round((stockAct+enCmd+qty)/weeklyDemand);
        const ok=wksCov>=(r.delai||0);
        return `<span style="font-weight:600;color:${ok?'var(--gr)':'var(--re)'}">${wksCov} sem.</span>`;
    }
    return '<span style="color:var(--t3)">—</span>';
})()}</td>
              <td style="text-align:right"><input type="number" min="0" step="0.01" value="${r.prix>0?r.prix.toFixed(2):''}" placeholder="—" style="width:75px;padding:2px 4px;border:1px solid var(--b2);border-radius:4px;font-size:12px;text-align:right;color:var(--t2)" onchange="majPrixPO('${fournSafe}','${nomSafe}',this.value)"></td>
              <td style="text-align:right;font-weight:500;color:var(--br)">${r.prix>0?fmtM(qtySel(r)*r.prix):'—'}</td>
            </tr>`;}).join('')}</tbody>
          </table></div>` : ''}
          
          ${renderHorsPO(f)}
          ${renderAjoutLibre(f,'b'+blocIdx)}
          ${renderAjoutPersonnalise(f,'b'+blocIdx)}
        </div>
      </div>`;
    }
  });
  document.getElementById('po-cont').innerHTML=html;
}

// -----------------------------------------------------------------
// 8. FINANCIAL BUDGET (Cash Flow Prediction)
// -----------------------------------------------------------------
// Draws the high-level cash flow overview week by week.
// 🚀 MODIFIÉ: Le Budget suit le bouton d'équipe (Tous / Nina / Clovis / Technique)

function rBudget(){
  const W=cw();

  // Titre dynamique selon l'équipe
  const titre=document.querySelector('#v-budget .st');
  if(titre) titre.textContent='Budget '+libelleEquipe()+' — Montant par semaine';

  // Technique : les pièces sont exclues des prévisions automatiques, donc pas de budget prévisionnel
  if(EQUIPE_FILTER==='technique'){
    document.getElementById('tb-b').innerHTML='<tr><td colspan="2" style="text-align:center;padding:40px;color:var(--t3)">Les pièces (équipe Technique) sont exclues du calcul automatique des commandes : il n\'y a donc pas de budget prévisionnel pour Technique.</td></tr>';
    return;
  }
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
  
  // Aggregate predicted costs by supplier — 🚀 équipe sélectionnée uniquement
  PREVISION.forEach(r=>{
    if(!equipeMatch(r.fourn, r))
      return;
    const qty=r.sems[sn]||0;
    if(!qty||!r.fourn)
      return;
    if(!byF[r.fourn])byF[r.fourn]={qty:0,montant:0,produits:[],pos:[]};
    byF[r.fourn].qty+=qty;
    byF[r.fourn].montant+=qty*(r.prix||0);
    byF[r.fourn].produits.push(r.nom);
  });
  
  // Match with real POs if they already exist — 🚀 équipe sélectionnée uniquement
  STOCKY.forEach(c=>{
    if(!equipeMatch(c.fourn))
      return;
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
  document.getElementById('bdet-title').textContent=label+' — détail par fournisseur ('+libelleEquipe()+')';
  
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
  const ni=document.querySelectorAll('.ni')[5];
  
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

  // 🚀 NEW: Automatically reset the week dropdown to "Toutes semaines" when clicking "À venir"
  if (f === 'coming') {
      const swpr = document.getElementById('sw-pr');
      if (swpr) swpr.value = '';
  }

  rPromos();
}

function rPromos(){
  const srch=(document.getElementById('s-pr')?.value||'').toLowerCase(); 
  const marque=document.getElementById('f-pr')?.value||'';
  const sw=parseInt(document.getElementById('sw-pr')?.value||'0')||0;
  const now = Date.now(); // 🚀 NEW: Call the master clock
  
  const rows=PROMOS.filter(r=>{
    if(marque&&r.marque!==marque) return false;
    if(sw>0&&!(r.sd<=sw&&r.sf>=sw)) return false; // Keeps the manual dropdown week filter working
    
    // 🚀 NEW: Flawless time filtering
    if(PF==='active' && !(now >= r.tsStart && now <= r.tsEnd)) return false;
    if(PF==='coming' && now >= r.tsStart) return false;
    if(PF==='past' && now <= r.tsEnd) return false;
    
    // 🚀 NEW: Search by Name or SKU
    if(srch && !r.produit.toLowerCase().includes(srch) && !(r.sku||'').toLowerCase().includes(srch)) return false;
    return true;
  });
  
  document.getElementById('rc-pr').textContent=rows.length+' promo(s)';
  document.getElementById('tb-pr').innerHTML=rows.map(r=>{
    // 🚀 NEW: Update badge logic to use timestamps
    const isA = now >= r.tsStart && now <= r.tsEnd;
    const isC = now < r.tsStart;
    const badge = isA ? `<span class="bx bgr">Active</span>` : isC ? `<span class="bx bbl">À venir</span>` : `<span class="bx bgy">Passée</span>`;
    
    const prixHtml=r.prixPromo>0 ?`<strong style="color:var(--br)">${r.prixPromo.toLocaleString('fr-CA',{minimumFractionDigits:2,maximumFractionDigits:2})} $</strong>` :'—';

    // 🚀 NEW: Dual Column Logic (Finds true name + true SKU)
    let vraiNom = r.produit;
    let vraiSku = r.sku || '—';
    let varActuelle = r.variante;
    
    const p = PRODS.find(x => (r.sku && x.skuFourn === r.sku) || normKey(x.nom) === normKey(r.produit) || normKey(x.nb) === normKey(r.produit));
    
    if (p) {
        vraiNom = p.nom;
        vraiSku = p.skuFourn || r.sku || '—';
        varActuelle = p.variante || r.variante;
    }
    
    const cleanNom = (varActuelle && vraiNom.endsWith(' - ' + varActuelle)) ? vraiNom.slice(0, -(varActuelle.length + 3)) : vraiNom;
    const varHtml = varActuelle ? `<div class="pv">${varActuelle}</div>` : '';

    // Notice the new <td> element for SKU below
    return`<tr>
      <td><div class="pn">${cleanNom}</div>${varHtml}</td>
      <td style="font-size:12px;color:var(--t3)">${vraiSku}</td> 
      <td style="white-space:nowrap">${r.marque}</td>
      <td>${badge}</td>
      <td style="white-space:nowrap;font-size:12px">S${String(r.sd).padStart(2,'0')}–S${String(r.sf).padStart(2,'0')}</td>
      <td style="font-size:12px">${r.dd}</td>
      <td style="font-size:12px">${r.df}</td>
      <td style="text-align:right;font-weight:600;color:${r.boost>=30?'var(--gr)':r.boost>=15?'var(--am)':'var(--t1)'}">${r.boost>0?r.boost+'%':'—'}</td>
      <td style="text-align:right">${prixHtml}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--t3)">Aucune promo</td></tr>';
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
    const srch = (document.getElementById('s-d')?.value || '').toLowerCase(); // 🚀 NEW: Grab search input
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

        // 🚀 NOUVEAU: Vue Technique = seulement les pièces. Autres vues = sans les pièces.
        if (EQUIPE_FILTER === 'technique' ? !estTechnique(p) : estTechnique(p))
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
            lowerName.includes("à vendre en boutique") ||
            lowerName.includes("tasting pack") ||       // NOUVEAU : Exclut les packs dégustation
            lowerName.includes("3 x 1kg");

        // If the product matches any of the names above, skip it immediately
        if (isExcluded) 
          return;

        // Strict Filter 2: Multi-Select Supplier
        if (selectedFourns.length > 0 && !selectedFourns.includes(p.fourn)) 
          return;

        // Text Search (Filters by Name or SKU)
        if (srch && !p.nom.toLowerCase().includes(srch) && !(p.skuFourn || '').toLowerCase().includes(srch)) {
            return;
        }

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
        // 🚀 NEW: Do not use .toLowerCase() here, let localeCompare handle it natively
        else if (sortBy === 'nom') { valA = a.product.nom; valB = b.product.nom; }
        else if (sortBy === 'fourn') { valA = a.product.fourn || ''; valB = b.product.fourn || ''; }

        // 🚀 NEW: Intelligent French Locale Sorting
        if (typeof valA === 'string' && typeof valB === 'string') {
            return valA.localeCompare(valB, 'fr', { numeric: true, sensitivity: 'base' }) * sortDir;
        }
        // Numerical sort calculation
        return (valA - valB) * sortDir; 
    });

    // UI Updates
    document.getElementById('kpi-d-units').textContent = fmt(totalUnits);
    document.getElementById('kpi-d-capital').textContent = fmtM(totalCapital);
    document.getElementById('rc-dormant').textContent = tableRows.length + ' produit(s)';


    


    // Render Table
    // Render Table
    document.getElementById('tb-dormant').innerHTML = tableRows.map(row => {
        const p = row.product;
        
        // Slice off the duplicate variant from the main name
        const cleanNom = (p.variante && p.nom.endsWith(' - ' + p.variante)) ? p.nom.slice(0, -(p.variante.length + 3)) : p.nom;

        return `
        <tr>
            <td>
                <div class="pn">${cleanNom}</div>
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
                <div style="position:relative; display:inline-block; text-align:left;">
                    <input type="text" class="fin" placeholder="🔍 Rechercher..." 
                           style="width: 160px; font-size: 11px; padding: 4px; text-align:center;" 
                           oninput="chercherSim(this, ${row.capital})" onfocus="chercherSim(this, ${row.capital})" onblur="setTimeout(()=>fermerSim(this), 200)">
                    <div class="sim-res" style="display:none;position:absolute;z-index:99;background:var(--w);border:1px solid var(--b2);border-radius:6px;width:240px;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.15);right:0;top:100%;margin-top:4px;"></div>
                </div>
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--t3)">Aucun stock dormant détecté 🎉</td></tr>`;
}

// ==========================================================
// AUTOCOMPLETE ENGINE FOR SIMULATION
// ==========================================================
function chercherSim(el, cap) {
    const q = el.value.toLowerCase().trim();
    const resDiv = el.nextElementSibling;
    if (!q) { resDiv.style.display = 'none'; return; }
    
    // Search the ENTIRE catalog by Name, Variant, or SKU
    const matches = PRODS.filter(p => 
        p.nom.toLowerCase().includes(q) || 
        (p.variante && p.variante.toLowerCase().includes(q)) || 
        (p.skuFourn && p.skuFourn.toLowerCase().includes(q))
    ).slice(0, 15);

    if (!matches.length) {
        resDiv.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--t3);text-align:center;">Aucun résultat</div>';
    } else {
        resDiv.innerHTML = matches.map(p => {
            const idSafe = (p.idVariante || p.nom).replace(/'/g, "\\'");
            const nomTxt = p.nom.replace(/'/g, "&#39;");
            const varTxt = (p.variante||'').replace(/'/g, "&#39;");
            return `<div style="padding:6px 10px;font-size:11px;border-bottom:1px solid var(--b1);cursor:pointer;line-height:1.3;" 
                         onclick="document.getElementById('kpi-receipt-card').scrollIntoView({behavior:'smooth'}); simulerLigne('${idSafe}', ${cap})">
                      <div style="font-weight:600;color:var(--t1)">${nomTxt}</div>
                      ${varTxt ? `<div style="color:var(--t3);font-size:10px">${varTxt}</div>` : ''}
                    </div>`;
        }).join('');
    }
    resDiv.style.display = 'block';
}

function fermerSim(el) {
    if(el && el.nextElementSibling) el.nextElementSibling.style.display = 'none';
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
function majSimulationPersonnalisee(qte, profitUnitaire, baseProfit) {
    const resultEl = document.getElementById('custom-profit-result');
    const grandTotalEl = document.getElementById('grand-total-profit');
    const grandTotalContainer = document.getElementById('grand-total-container');
    if (!resultEl) return;
    
    // Calculate the extra profit from the custom box
    const parsedQte = parseInt(qte, 10);
    const customProfit = (isNaN(parsedQte) ? 0 : parsedQte) * profitUnitaire;
    
    resultEl.textContent = (customProfit > 0 ? '+' : '') + fmtM(customProfit);
    resultEl.style.color = customProfit >= 0 ? 'var(--gr)' : 'var(--re)';

    // 🚀 NEW: Combine base profit with extra profit and update the big number at the top!
    if (grandTotalEl && grandTotalContainer) {
        const grandTotal = baseProfit + customProfit;
        const sign = grandTotal > 0 ? '+' : '';
        grandTotalEl.textContent = sign + fmtM(grandTotal);
        grandTotalContainer.style.color = grandTotal >= 0 ? 'var(--gr)' : 'var(--re)';
    }
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

    // 🚀 FIXED: Find the target product using the typed text from the datalist
    // 🚀 FIXED: Allow the simulation to search the exact catalog ID or full Name
    const targetProd = PRODS.find(x => x.idVariante === targetId || x.nom === targetId);
    
    if (!targetProd) {
        alert("Produit introuvable dans le catalogue.");
        return;
    }

    // 2. Retrieve Costs and Prices directly from the global maps
    const targetCost = targetProd.cout || 0;
    const targetPrice = PRIX_MAP[targetProd.idVariante] || PRIX_MAP[targetProd.nom] || PRIX_MAP[targetProd.nb] || 0;

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
    const finalSimulatedUnitsSold = simulatedUnitsPurchased;
    
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
        <!-- 🚀 FIXED: Added IDs so the script can target and colorize the Grand Total -->
        <div class="receipt-total" id="grand-total-container" style="color: ${profitColor}; transition: color 0.2s ease;">
            <span id="grand-total-profit">${sign}${fmtM(finalProjectedGrossProfit)}</span> 
            <span style="font-size: 11px; font-weight: normal; color: var(--t3); margin-left: 8px;">Profit Brut Projeté</span>
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
                <strong>3. Ventes simulées :</strong> 
                <span>La simulation utilise <span class="em">${fmt(finalSimulatedUnitsSold)} unités</span></span>
                <span class="receipt-source">Limité par le capital</span>
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
                <span>Si j'ajoute</span>
                <!-- 🚀 FIXED: Passed the base profit into the oninput trigger -->
                <input type="number" min="0" placeholder="0" style="width: 70px; padding: 4px; border: 1px solid var(--b2); border-radius: 4px; font-size: 12px; text-align: center;" oninput="majSimulationPersonnalisee(this.value, ${profitPerUnit}, ${finalProjectedGrossProfit})">
                <span>unités en plus</span>
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
// 🚀 MODIFIÉ: Le HTML du PO est construit par construireHtmlPO, mis en page avec des tableaux
// pour être identique à l'impression ET dans le PDF joint au courriel (généré par Apps Script).
function construireHtmlPO(fourn, poNum, dateLivraison, lignes, avecImpression){
  const today = new Date().toLocaleDateString('fr-CA', {day:'numeric', month:'long', year:'numeric'});
  const fmt2 = v => n(v).toLocaleString('fr-CA', {minimumFractionDigits:2, maximumFractionDigits:2})+' $';
  const escH = t => String(t == null ? '' : t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const td = 'padding:10px 0; border-bottom:1px solid #E5E0D8; vertical-align:top';
  const th = 'text-align:left; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:.04em; padding-bottom:10px; border-bottom:2px solid #1A1714';
  const lbl = 'font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:.05em; color:#1A1714; padding-bottom:8px';
  const val = 'font-size:13px; color:#1A1714; line-height:1.5';

  let sousTotal = 0;
  const lignesHtml = lignes.map(l => {
    const total = l.qte * l.prix;
    sousTotal += total;
    // Infos Technique (n° commande client, machine, n° de série) sous le nom du produit
    const infosTech = [
      l.cmdClient ? 'Commande client : <b>' + escH(l.cmdClient) + '</b>' : '',
      l.machine ? 'Machine / moulin / accessoire : <b>' + escH(l.machine) + '</b>' : '',
      l.serie ? 'N° de série : <b>' + escH(l.serie) + '</b>' : ''
    ].filter(Boolean);
    return `<tr>
      <td style="${td}">
        <div style="font-weight:bold">${escH(l.nom)}</div>
        ${l.variante ? `<div style="font-size:12px; color:#6B6560">${escH(l.variante)}</div>` : ''}
        ${infosTech.length ? `<div style="font-size:11px; color:#1A1714; margin-top:5px; padding:5px 8px; background:#F5F0E8; line-height:1.6">${infosTech.join('<br>')}</div>` : ''}
      </td>
      <td style="${td}; font-size:12px; color:#6B6560">${escH(l.sku || '—')}</td>
      <td style="${td}; text-align:center">${l.qte}</td>
      <td style="${td}; text-align:right">${fmt2(l.prix)}</td>
      <td style="${td}; text-align:right">0%</td>
      <td style="${td}; text-align:right; font-weight:bold">${fmt2(total)}</td>
    </tr>`;
  }).join('');

  const ADRESSE = 'Café Liégeois Canada Inc.<br>5524 Rue Saint-Patrick<br>Suite 140<br>Montréal QC H4E 1A8<br>Canada';
  const fournSafe = escH(fourn.replace(' (Café)', '').trim()); // 🚀 NEW: Strip the tag
  const col = (titre, contenu) => `<td style="width:33%; vertical-align:top; padding-right:20px"><div style="${lbl}">${titre}</div><div style="${val}">${contenu}</div></td>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>PO — ${fournSafe}</title>
  <style>
    body{font-family:Arial,'Helvetica Neue',sans-serif; color:#1A1714; padding:40px 50px; max-width:900px; margin:0 auto}
    table{border-collapse:collapse}
    @media print{ body{padding:20px 40px} }
  </style></head><body>
    <table style="width:100%; font-size:13px; color:#6B6560; margin-bottom:30px"><tr>
      <td>Café Liégeois Canada Inc.</td><td style="text-align:right">#${escH(poNum)}</td>
    </tr></table>
    <table style="width:100%; margin-bottom:30px"><tr>
      <td style="font-size:28px; font-weight:bold; vertical-align:top">Café Liégeois Canada Inc.</td>
      <td style="text-align:right; font-size:14px; line-height:1.5; vertical-align:top"><div style="font-weight:bold; font-size:16px">#${escH(poNum)}</div><div>${today}</div></td>
    </tr></table>
    <table style="width:100%; margin-bottom:22px"><tr>
      ${col('Fournisseur', fournSafe)}${col('Expédier à', ADRESSE)}${col('Facturer à', ADRESSE)}
    </tr></table>
    <table style="width:100%; margin-bottom:22px"><tr>
      ${col('Modalités de paiement', 'Paiement à la livraison')}${col('Devise du fournisseur', 'CAD')}${col('Arrivée estimée', escH(dateLivraison))}
    </tr></table>
    <div style="border-top:2px solid #1A1714; margin:22px 0"></div>
    <table style="width:100%; font-size:13px">
      <thead><tr>
        <th style="${th}">Produits</th><th style="${th}">SKU du fournisseur</th><th style="${th}; text-align:center">Qté</th>
        <th style="${th}; text-align:right">Coût</th><th style="${th}; text-align:right">Taxe</th><th style="${th}; text-align:right">Total (CAD)</th>
      </tr></thead>
      <tbody>${lignesHtml}</tbody>
    </table>
    <table style="width:320px; margin-left:auto; margin-top:20px; font-size:13px">
      <tr><td style="padding:6px 0">Taxes (incluses)</td><td style="padding:6px 0; text-align:right">${fmt2(0)}</td></tr>
      <tr><td style="padding:6px 0">Sous-total (${lignes.length} article${lignes.length>1?'s':''})</td><td style="padding:6px 0; text-align:right">${fmt2(sousTotal)}</td></tr>
      <tr><td style="border-top:2px solid #1A1714; font-weight:bold; font-size:15px; padding-top:10px">Total</td><td style="border-top:2px solid #1A1714; font-weight:bold; font-size:15px; padding-top:10px; text-align:right">${fmt2(sousTotal)}</td></tr>
    </table>
    <div style="margin-top:60px; padding-top:16px; border-top:1px solid #D5CFC6; font-size:12px; color:#6B6560">
      <div style="font-weight:bold; margin-bottom:4px">Café Liégeois Canada Inc.</div>
      <div>5524 Rue Saint-Patrick</div>
      <div>info@cafeliegeois.ca</div>
    </div>
    ${avecImpression ? '<script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script>' : ''}
  </body></html>`;
}

/**
 * Ouvre le document PO dans un nouvel onglet et lance l'impression (enregistrer en PDF)
 */
function ouvrirDocumentPO(fourn, poNum, dateLivraison, lignes){
  const html = construireHtmlPO(fourn, poNum, dateLivraison, lignes, true);
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
  const lignes = lignesPDFUnPO(fourn, poNumber);
  if(!lignes){ alert('PO introuvable.'); return; }
  ouvrirDocumentPO(fourn, poNumber, '-', lignes);
}

// Prépare les lignes d'un PO envoyé pour le PDF (impression ou courriel). Retourne null si le PO est introuvable.
function lignesPDFUnPO(fourn, poNumber){
  const entree = (PO_ENVOYES[fourn] || []).find(e => e.poNumber === poNumber);
  if(!entree) return null;
  return entree.lignes.filter(l => l.quantite > 0).map(l => {
    const p = PRODS.find(x => x.idVariante === l.idVariante);
    return {
      nom: l.nom || (p ? p.nom : '(produit non identifié)'),
      variante: l.variante || (p && p.variante ? p.variante : ''),
      // 🚀 FIXED: Prioritize manually saved SKUs over the catalog
      sku: l.sku !== undefined ? l.sku : (p && p.skuFourn ? p.skuFourn : '—'),
      qte: l.quantite,
      cmdClient: l.cmdClient || '', machine: l.machine || '', serie: l.serie || '', // 🚀 NOUVEAU: infos Technique
      // 🚀 FIXED: Prioritize manually saved prices over the catalog
      prix: l.prix !== undefined ? l.prix : ((COUT_MAP[l.idVariante] || 0) || (p ? (COUT_MAP[normKey(p.nom)] || 0) : 0) || (PRIX_FALLBACK_ID[l.idVariante] || 0))
    };
  });
}

// 🚀 NOUVEAU: Prépare un brouillon de courriel dans la boîte tech@cafeliegeois.ca, avec le PO en PDF
async function preparerCourrielTechnique(fourn, poNumber, dateLivraisonFmt){
  const lignes = lignesPDFUnPO(fourn, poNumber);
  if(!lignes || !lignes.length){ alert('PO introuvable ou vide.'); return; }

  const html = construireHtmlPO(fourn, poNumber, dateLivraisonFmt || '-', lignes, false);
  try {
    const data = await fetch(URL_AS, { // 🚀 Même Apps Script que le reste (action "draft_po")
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'draft_po', fournisseur: fourn.replace(' (Café)', '').trim(), poNumber: poNumber, html: html })
    }).then(r => r.json());

    if(!data.success){ alert('Erreur lors de la préparation du courriel : ' + (data.error || 'inconnue')); return; }

    let msg = '✉️ Brouillon prêt dans la boîte tech@cafeliegeois.ca (PO ' + poNumber + ' en pièce jointe).';
    msg += data.to ? '\nDestinataire : ' + data.to : '\n⚠️ Aucune adresse enregistrée pour ce fournisseur : ajoute-la dans le brouillon.';
    if(confirm(msg + '\n\nOuvrir les brouillons de tech@ ?')){
      window.open('https://mail.google.com/mail/u/?authuser=tech%40cafeliegeois.ca#drafts', '_blank');
    }
  } catch(err){
    alert('Erreur réseau (courriel Technique) : ' + err.message);
  }
}

/**
 * Permet au modal de modification de PO d'imprimer l'état actuel de ses lignes
 */
function telechargerPDFDepuisModal(){
  if(!MODIF_PO_CTX) return;
  const {fourn, poNumber} = MODIF_PO_CTX;
  const lignes = MODIF_PO_LINES.filter(l => l.quantite > 0).map(l => ({
    nom: l.nom, variante: l.variante || '', sku: l.sku || '—', qte: l.quantite, prix: l.prix || 0,
    cmdClient: l.cmdClient || '', machine: l.machine || '', serie: l.serie || '' // 🚀 NOUVEAU: infos Technique
  }));
  
  // 🚀 FIXED: Use calendar date, fallback to fuzzy text, fallback to '-'
  const rawDate = document.getElementById('mp-date').value;
  const dateFmt = rawDate 
      ? new Date(rawDate + 'T00:00:00').toLocaleDateString('fr-CA', {day:'numeric', month:'long', year:'numeric'}) 
      : (MODIF_PO_CTX.originalDate || '-');
  
  ouvrirDocumentPO(fourn, poNumber, dateFmt, lignes);
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

  // 🚀 NEW: Ensures custom products get their customId assigned to idVariante
  const toutesLignes = prods.map(r=>{
    const p = PRODS.find(x=>x.nom===r.nom);
    const targetId = r._custom ? r.customId : (r.idVariante || (p ? p.idVariante : '')); // 🚀 NEW: Captures the ID early for the override lookup
    
    return { 
        idVariante: targetId, 
        quantite: sems.reduce((s,sw)=>s+(r.sems[sw]||0),0), 
        nom:r.nom, 
        variante: r._custom ? r.variante : (p&&p.variante?p.variante:''), 
        // 🚀 NEW: Checks the override memory first. If empty, uses the original catalog SKU.
        sku: SKU_OVERRIDE_TEMP[targetId] !== undefined ? SKU_OVERRIDE_TEMP[targetId] : (p&&p.skuFourn?p.skuFourn:''), 
        prix: r.prix || 0,
        ...infoTech(targetId) // 🚀 NOUVEAU: infos Technique
    };
  }).filter(l => l.idVariante && l.quantite > 0);

  if(!toutesLignes.length){
    alert('Veuillez ajouter des quantités valides avant de créer la commande.');
    return;
  }

  // 🚀 AVERTISSEMENT DE DOUBLE COMMANDE (Ignores custom items)
  const doubles = toutesLignes.filter(l => idVEnvoyes.has(l.idVariante) && !String(l.idVariante).startsWith('custom-'));
  if (doubles.length > 0) {
      const msgs = doubles.map(l => {
          const poList = (PO_ENVOYES[fourn] || []).filter(e => e.lignes.some(el => el.idVariante === l.idVariante)).map(e => e.poNumber);
          return `- ${l.nom} (Dans PO: ${poList.join(', ')})`;
      });
      if (!confirm("⚠️ ATTENTION : Les produits suivants sont déjà dans une commande existante :\n\n" + msgs.join('\n') + "\n\nÊtes-vous certain de vouloir créer une DOUBLE COMMANDE pour ces articles ?")) {
          return; 
      }
  }

  // VERIFICATION DES MULTIPLES (MOQ HARD BLOCK - Ignores custom items)
  for (let l of toutesLignes) {
      if (String(l.idVariante).startsWith('custom-')) continue;
      const moqRequis = MOQ_MAP[l.idVariante] || 1;
      if (moqRequis > 1 && l.quantite % moqRequis !== 0) {
          alert(`⚠️ Arrêt : La quantité pour "${l.nom}" (${l.quantite}) n'est pas un multiple de ${moqRequis}. La commande a été annulée. Modifiez la quantité pour correspondre au lot.`);
          return; 
      }
  }

  const btn = document.getElementById('cpo-submit'); // 🚀 Updated to disable the modal button
  if(btn){ btn.disabled = true; btn.textContent = 'Envoi…'; }

  // 🚀 FIXED: Grab the date from the new modal input
  const dateInput = document.getElementById('cpo-date');
  const dateLivraison = dateInput ? dateInput.value : '';

  // 🚀 NEW: SPLIT CUSTOM AND SHOPIFY LINES
  const lignesShopify = toutesLignes.filter(l => !String(l.idVariante).startsWith('custom-')).map(l=>({idVariante:l.idVariante, quantite:l.quantite}));
  const lignesCustom = toutesLignes.filter(l => String(l.idVariante).startsWith('custom-'));

  // SCENARIO A: 100% CUSTOM
  if (!lignesShopify.length && lignesCustom.length > 0) {
      const fakePoNumber = 'CM-' + Math.floor(1000 + Math.random() * 9000);
      if(!PO_ENVOYES[fourn]) PO_ENVOYES[fourn]=[];
      PO_ENVOYES[fourn].push({
          poNumber: fakePoNumber, 
          lignes: toutesLignes.map(l=>({idVariante:l.idVariante,quantite:l.quantite,nom:l.nom,variante:l.variante,sku:l.sku,cmdClient:l.cmdClient,machine:l.machine,serie:l.serie})), 
          date: new Date().toISOString()
      });
      alert('✓ Commande 100% personnalisée créée : ' + fakePoNumber);
      rPO();
      if(btn){ btn.disabled = false; btn.textContent = 'Créer la commande'; }
      return;
  }

  // SCENARIO B: MIXED LOGIC (Sends Shopify lines, glues custom lines onto PDF)
  // SCENARIO B: MIXED LOGIC (Sends Shopify lines, glues custom lines onto PDF)
  try {
    // 🚀 FIXED: Combine the auto-note with the user's custom note
    const baseNote = 'Commande créée depuis le dashboard - semaine(s) ' + sems.map(s=>'S'+String(s).padStart(2,'0')).join(', ') + (dejaEnvoyes.length?' (complément)':'');
    const customNote = document.getElementById('cpo-note') ? document.getElementById('cpo-note').value.trim() : '';
    let note = customNote ? customNote + '\n\n' + baseNote : baseNote;

    // 🚀 NOUVEAU: Les infos Technique sont aussi écrites dans la note du transfert Shopify (gardées après rechargement)
    const lignesInfoTech = toutesLignes.filter(l => l.cmdClient || l.machine || l.serie).map(l =>
      '- ' + l.nom + (l.variante ? ' (' + l.variante + ')' : '') + ' : ' +
      [l.cmdClient ? 'commande client ' + l.cmdClient : '', l.machine ? 'machine ' + l.machine : '', l.serie ? 'n° de série ' + l.serie : ''].filter(Boolean).join(', ')
    );
    if (lignesInfoTech.length) note += '\n\nInfos Technique :\n' + lignesInfoTech.join('\n');
    
    const fournReel = fourn.replace(' (Café)', '').trim();
    const data = await envoyerLignesAuBackend(fournReel, note, lignesShopify, dateLivraison);

    if(data.success){
      if(!PO_ENVOYES[fourn])PO_ENVOYES[fourn]=[];
      // We re-glue all lines (custom + shopify) into local memory for the PDF
      PO_ENVOYES[fourn].push({
          poNumber:data.poNumber, 
          lignes: toutesLignes.map(l=>({idVariante:l.idVariante,quantite:l.quantite,nom:l.nom,variante:l.variante,sku:l.sku,cmdClient:l.cmdClient,machine:l.machine,serie:l.serie})), 
          date:new Date().toISOString()
      });
      
      if(data.lignesIgnorees && data.lignesIgnorees.length > 0){
        alert('Commande créée (' + data.poNumber + '), mais ' + data.lignesIgnorees.length + ' ligne(s) ignorée(s) — ID(s) variante introuvable(s) : ' + data.lignesIgnorees.join(', '));
      } else {
        alert('✓ Commande créée : ' + data.poNumber + (data.dateAvertissement ? ' — ' + data.dateAvertissement : ''));
      }
      rPO();
      // 🚀 NOUVEAU: En vue Technique, proposer le brouillon de courriel au fournisseur (PDF joint)
      if (EQUIPE_FILTER === 'technique' && confirm('Préparer le brouillon de courriel au fournisseur dans tech@cafeliegeois.ca, avec le PO en PDF ?')) {
        const dateFmtCourriel = dateLivraison
          ? new Date(dateLivraison + 'T00:00:00').toLocaleDateString('fr-CA', {day:'numeric', month:'long', year:'numeric'})
          : '-';
        preparerCourrielTechnique(fourn, data.poNumber, dateFmtCourriel);
      }
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
      prix: p ? (COUT_MAP[l.idVariante]||COUT_MAP[normKey(p.nom)]||PRIX_FALLBACK_ID[l.idVariante]||0) : 0,
      cmdClient: l.cmdClient || '', machine: l.machine || '', serie: l.serie || '' // 🚀 NOUVEAU: infos Technique
    };
  });

  document.getElementById('mp-titre').textContent = 'Modifier le PO '+poNumber+' — '+fourn;
  document.getElementById('mp-add-input').value='';
  document.getElementById('mp-add-res').style.display='none';
  
  // 🚀 FIXED: Auto-populate date OR show fuzzy text label
  const dateInput = document.getElementById('mp-date');
  const fuzzyLabel = document.getElementById('mp-fuzzy-date');
  dateInput.value = '';
  fuzzyLabel.textContent = '';
  
  const existingOrder = STOCKY.find(c => c.cmd === poNumber) || TRANSFERTS.find(c => c.cmd === poNumber);
  
  if (existingOrder && existingOrder.livraison) {
      // Save original text in memory for the PDF fallback
      MODIF_PO_CTX.originalDate = existingOrder.livraison; 
      
      try {
          const parts = existingOrder.livraison.split('/');
          if (parts.length === 3) {
              const y = parseInt(parts[2]);
              const safeY = y < 100 ? y + 2000 : y;
              dateInput.value = `${safeY}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          } else if (existingOrder.livraison !== 'Indéterminé' && existingOrder.livraison !== '—') {
              // It's a text date like "Mi-septembre"
              fuzzyLabel.textContent = `(Actuel : ${existingOrder.livraison})`;
          }
      } catch(e) {}
  }

  renderLignesModifPO();
  document.getElementById('modal-modifpo-overlay').style.display = 'flex';
}

function fermerModifPO(){
  document.getElementById('modal-modifpo-overlay').style.display = 'none';
  MODIF_PO_CTX = null;
  MODIF_PO_LINES = [];

  // 🚀 FIXED: Unfreeze and reset the submit button so it works the next time you open the modal!
  const btn = document.getElementById('mp-submit');
  if(btn){ 
      btn.disabled = false; 
      btn.textContent = 'Enregistrer les modifications'; 
  }
}

function majQuantiteModifPOLigne(idx, val){
  MODIF_PO_LINES[idx].quantite = Math.max(0, parseFloat(val)||0); // Modifié
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
    
    // Safety check for Custom items
    const isCustom = l.idVariante && String(l.idVariante).startsWith('custom-');
    if(!l.idVariante || isCustom) deltaTxt = `<span style="color:var(--am);font-size:11px">⚠ Produit personnalisé/hors catalogue — PDF uniquement, pas de synchronisation Shopify</span>`;
    else if(delta>0) deltaTxt = `<span style="color:var(--gr);font-size:11px">+${delta} (complément à envoyer)</span>`;
    else if(delta<0) deltaTxt = `<span style="color:var(--re);font-size:11px">${delta} (à ajuster manuellement dans Shopify)</span>`;

    // 🚀 NOUVEAU: Récupère le MOQ et construit les badges de validation
    const moq = MOQ_MAP[l.idVariante] || 1;
    let validationBadge = '';
    let moqBadge = moq > 1 
        ? `<div style="background:var(--amb); color:var(--am); padding:2px 4px; border-radius:4px; font-size:9px; font-weight:bold; margin-top:4px; display:inline-block;">📦 Lot de ${moq}</div>` 
        : `<div style="color:var(--t3); font-size:9px; font-weight:600; margin-top:4px;">Pas de min.</div>`;
    if (moq > 1 && l.quantite > 0) {
        if (l.quantite % moq === 0) {
            validationBadge = `<div style="color:var(--gr); font-size:10px; font-weight:bold; margin-top:4px;">✅ OK</div>`;
        } else {
            validationBadge = `<div style="color:var(--re); font-size:10px; font-weight:bold; margin-top:4px;">⚠️ Invalide</div>`;
        }
    }
    const stepVal = moq > 1 ? moq : '1';
    
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--b1)">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${l.nom}</div>
        ${l.variante?`<div style="font-size:11px;color:var(--t3)">${l.variante}</div>`:''}
        ${deltaTxt}
      </div>
      
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-size:10px;color:var(--t3)">SKU (Modif. PDF)</span>
        <input type="text" value="${l.sku}" style="width:100px;padding:4px;border:1px solid var(--b2);border-radius:6px;font-size:11px;" onchange="majSkuModifPOLigne(${idx},this.value)">
      </div>

      <div style="display:flex;flex-direction:column;gap:2px;align-items:center;">
        <span style="font-size:10px;color:var(--t3)">Qté (Envoyée: ${l.quantiteOriginale})</span>
        <input type="number" min="0" step="${stepVal}" value="${l.quantite}" style="width:50px;padding:4px;border:1px solid var(--b2);border-radius:6px;font-size:12px;text-align:center" onchange="majQuantiteModifPOLigne(${idx},this.value)">
        <div style="display:flex; flex-direction:column; align-items:center;">
            ${moqBadge}
            ${validationBadge}
        </div>
      </div>
      
      <div style="display:flex;flex-direction:column;gap:2px;align-items:flex-end;">
        <span style="font-size:10px;color:var(--t3)">Prix unit.</span>
        <input type="number" min="0" step="0.01" value="${l.prix>0?l.prix.toFixed(2):'0.00'}" style="width:65px;padding:4px;border:1px solid var(--b2);border-radius:6px;font-size:12px;text-align:right" onchange="majPrixModifPOLigne(${idx},this.value)">
      </div>
      
      <div style="width:70px;text-align:right;font-size:12px;color:var(--br);font-weight:500">${fmtM(l.quantite*l.prix)}</div>
      <a href="#" onclick="retirerLigneModifPO(${idx});return false;" style="color:var(--re);font-size:11px;text-decoration:underline; margin-left:8px;">✕</a>
    </div>`;
  }).join('');
  document.getElementById('mp-total').textContent = MODIF_PO_LINES.length ? 'Total : '+fmtM(total) : '';
}

// Helper to update the SKU in memory
function majSkuModifPOLigne(idx, val){
  MODIF_PO_LINES[idx].sku = val;
}

// Add these two new helper functions right underneath it:
function majPrixModifPOLigne(idx, val){
  MODIF_PO_LINES[idx].prix = Math.max(0, parseFloat(val)||0);
  renderLignesModifPO();
}

function ajouterProduitPersonnaliseModifPO(){
  const nomEl = document.getElementById('mp-cust-nom');
  const prixEl = document.getElementById('mp-cust-prix');
  const qteEl = document.getElementById('mp-cust-qte');
  
  const nom = (nomEl?.value||'').trim();
  const prix = Math.max(0, parseFloat(prixEl?.value)||0);
  const qte = Math.max(0.01, parseFloat(qteEl?.value)||1); // Modifié
  
  if(!nom){ alert('Veuillez indiquer un nom de produit.'); return; }
  
  const id = 'custom-' + Date.now();
  MODIF_PO_LINES.push({
    idVariante: id, nom: nom, variante: '', sku: '',
    quantiteOriginale: 0, quantite: qte, prix: prix
  });
  
  nomEl.value = ''; prixEl.value = ''; qteEl.value = '1';
  renderLignesModifPO();
}

async function enregistrerModifPO(){
  if(!MODIF_PO_CTX) return;
  const {fourn, poNumber} = MODIF_PO_CTX;

  // 1. Instantly save everything to local memory for the PDF!
  const oldEntryIndex = PO_ENVOYES[fourn].findIndex(e => e.poNumber === poNumber);
  if (oldEntryIndex > -1) {
     PO_ENVOYES[fourn][oldEntryIndex].lignes = MODIF_PO_LINES;
  }

  // 2. Lock the new Date into memory
  const newDateVal = document.getElementById('mp-date').value;
  if (newDateVal) {
      const newDateFmt = new Date(newDateVal + 'T00:00:00').toLocaleDateString('fr-CA', {day:'numeric', month:'long', year:'numeric'});
      const existingOrder = STOCKY.find(c => c.cmd === poNumber) || TRANSFERTS.find(c => c.cmd === poNumber);
      if (existingOrder) {
          existingOrder.livraison = newDateFmt;
          existingOrder.livraison_originale = ''; 
      }
  }

  // 🚀 FIXED: Grab ALL valid Shopify items with their NEW absolute quantities
  const envoyablesShopify = MODIF_PO_LINES
      .filter(l => l.idVariante && !String(l.idVariante).startsWith('custom-') && l.quantite > 0)
      .map(l => ({idVariante: l.idVariante, quantite: l.quantite, nom: l.nom, variante: l.variante, sku: l.sku}));

  if(!envoyablesShopify.length){ 
     fermerModifPO(); 
     rPO(); 
     alert("Modifications enregistrées localement pour le PDF ! (Aucun produit Shopify à synchroniser)"); 
     return; 
  }

  // 🚀 NOUVEAU: Vérification des multiples (MOQ hard block)
  for (let l of envoyablesShopify) {
      const moqRequis = MOQ_MAP[l.idVariante] || 1;
      if (moqRequis > 1 && l.quantite % moqRequis !== 0) {
          alert(`⚠️ Arrêt : La quantité pour "${l.nom}" (${l.quantite}) n'est pas un multiple de ${moqRequis}. Modifiez la quantité pour correspondre au lot.`);
          return;
      }
  }

  if(!confirm(`Mettre à jour le transfert Shopify ${poNumber} avec les nouvelles quantités ?`)) return;

  const btn = document.getElementById('mp-submit');
  if(btn){ btn.disabled = true; btn.textContent = 'Mise à jour Shopify...'; }

  try{
    // 🚀 NEW: Call the new backend update engine directly!
    const data = await fetch(URL_AS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
          action: 'update_po', 
          poNumber: poNumber, 
          fournisseur: fourn, 
          dateLivraison: newDateVal, 
          lignes: envoyablesShopify 
      })
    }).then(r => r.json());

    if(data.success){
      if (!PO_ENVOYES[fourn]) PO_ENVOYES[fourn] = [];
      const updatedIndex = PO_ENVOYES[fourn].findIndex(e => e.poNumber === poNumber);
      if (updatedIndex > -1) {
         PO_ENVOYES[fourn][updatedIndex].lignes = MODIF_PO_LINES;
      } else {
         PO_ENVOYES[fourn].push({poNumber: poNumber, lignes: MODIF_PO_LINES, date:new Date().toISOString()});
      }
      
      fermerModifPO();
      rPO();
      if(confirm(`Le transfert ${poNumber} a été mis à jour dans Shopify ! Télécharger le nouveau PDF ?`)){
        telechargerPDFUnPO(fourn, poNumber); 
      }
    } else {
      alert('Erreur Shopify : ' + (data.error || 'inconnue'));
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
  // 🚀 NOUVEAU: Commande manuelle non disponible en vue Technique
  if (EQUIPE_FILTER === 'technique') {
    alert("La commande manuelle n'est pas disponible en vue Technique. Utilise Construire un PO.");
    return false;
  }
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
  // 🚀 FIXED: Enforce whole numbers for quantities
  MANUAL_LINES[idx].quantite = Math.max(0, parseInt(val, 10) || 0); 
  // 🚀 FIXED: Redraw the entire line to force the visual totals to update
  renderLignesManuelles(); 
}

// 🚀 NEW: Allow users to edit the Unit Price directly in the row
function majPrixManuelle(idx, val){
  MANUAL_LINES[idx].prixOverride = Math.max(0, parseFloat(val) || 0);
  renderLignesManuelles();
}

function prixLigneManuelle(l){
  if (l.prixOverride != null) return l.prixOverride;
  return (COUT_MAP[l.idVariante]||0)||COUT_MAP[normKey(l.nom)]||(PRIX_FALLBACK_ID[l.idVariante]||0);
}
function ajouterProduitPersonnaliseManuel(){
  const nomEl = document.getElementById('mc-cust-nom');
  const prixEl = document.getElementById('mc-cust-prix');
  const qteEl = document.getElementById('mc-cust-qte');
  
  const nom = (nomEl?.value||'').trim();
  const prix = Math.max(0, parseFloat(prixEl?.value)||0);
  const qte = Math.max(1, parseInt(qteEl?.value, 10)||1);
  
  if(!nom){ alert('Indique un nom de produit.'); return; }
  
  const id = 'custom-' + Date.now();
  MANUAL_LINES.push({ idVariante: id, nom: nom, variante: '', quantite: qte, prixOverride: prix });
  
  nomEl.value = ''; prixEl.value = ''; qteEl.value = '1';
  renderLignesManuelles();
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
  
  cont.innerHTML = MANUAL_LINES.map((l, idx) => {
    const prixU = prixLigneManuelle(l);
    const totalLigne = prixU * l.quantite;
    
    // 🚀 NEW: Retrieve MOQ and build validation badges
    const moq = MOQ_MAP[l.idVariante] || 1;
    let validationBadge = '';
    let moqBadge = moq > 1 
        ? `<div style="background:var(--amb); color:var(--am); padding:2px 4px; border-radius:4px; font-size:9px; font-weight:bold; margin-top:4px; display:inline-block;">📦 Lot de ${moq}</div>` 
        : `<div style="color:var(--t3); font-size:9px; font-weight:600; margin-top:4px;">Pas de min.</div>`;
    
    if (moq > 1 && l.quantite > 0) {
        if (l.quantite % moq === 0) {
            validationBadge = `<div style="color:var(--gr); font-size:10px; font-weight:bold; margin-top:4px;">✅ OK</div>`;
        } else {
            validationBadge = `<div style="color:var(--re); font-size:10px; font-weight:bold; margin-top:4px;">⚠️ Invalide</div>`;
        }
    }
    const stepVal = moq > 1 ? moq : '1';

    return `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--b1)">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${l.nom}</div>
        ${l.variante ? `<div style="font-size:11px;color:var(--t3)">${l.variante}</div>` : ''}
      </div>
      
      <div style="display:flex;flex-direction:column;gap:2px;align-items:flex-end;">
        <span style="font-size:10px;color:var(--t3)">Prix unit.</span>
        <input type="number" min="0" step="0.01" value="${prixU > 0 ? prixU.toFixed(2) : '0.00'}" onchange="majPrixManuelle(${idx},this.value)" style="width:65px;padding:4px;border:1px solid var(--b2);border-radius:6px;font-size:12px;text-align:right">
      </div>

      <!-- 🚀 FIXED: Quantity Column with strict MOQ Logic -->
      <div style="display:flex;flex-direction:column;gap:2px;align-items:center;">
        <span style="font-size:10px;color:var(--t3)">Qté</span>
        <input type="number" min="0" step="${stepVal}" value="${l.quantite}" onchange="majQuantiteManuelle(${idx},this.value)" style="width:50px;padding:4px;border:1px solid var(--b2);border-radius:6px;font-size:12px;text-align:center">
        <div style="display:flex; flex-direction:column; align-items:center;">
            ${moqBadge}
            ${validationBadge}
        </div>
      </div>
      
      <div style="width:70px;text-align:right;font-size:12px;color:var(--br);font-weight:500;margin-top:14px;">
        ${fmtM(totalLigne)}
      </div>
      
      <button class="rbtn" onclick="retirerLigneManuelle(${idx})" style="padding:4px 8px; margin-top:14px; margin-left:4px;">✕</button>
    </div>
    `;
  }).join('');
  
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

  // 1. Separate real Shopify items from custom items
  const lignesShopify = MANUAL_LINES
    .filter(l => l.quantite > 0 && !String(l.idVariante).startsWith('custom-'))
    .map(l => ({ idVariante: l.idVariante, quantite: l.quantite }));

  const lignesCustom = MANUAL_LINES
    .filter(l => l.quantite > 0 && String(l.idVariante).startsWith('custom-'));




  const toutesLesLignesValides = MANUAL_LINES.filter(l => l.quantite > 0);
  if(!toutesLesLignesValides.length){ alert('Toutes les quantités sont à 0.'); return; }

  // 🚀 NEW: VERIFICATION DES MULTIPLES (MOQ HARD BLOCK FOR MANUAL ORDERS)
  for (let l of toutesLesLignesValides) {
      if (String(l.idVariante).startsWith('custom-')) continue;
      const moqRequis = MOQ_MAP[l.idVariante] || 1;
      if (moqRequis > 1 && l.quantite % moqRequis !== 0) {
          alert(`⚠️ Arrêt : La quantité pour "${l.nom}" (${l.quantite}) n'est pas un multiple de ${moqRequis}. Modifiez la quantité pour correspondre au lot.`);
          return; 
      }
  }


  const btn = document.getElementById('mc-submit');
  btn.disabled = true;
  btn.textContent = 'Envoi…';

  // SCENARIO A: 100% Custom Products (Bypass Shopify API entirely)
  if (!lignesShopify.length && lignesCustom.length > 0) {
      const fakePoNumber = 'CM-' + Math.floor(1000 + Math.random() * 9000); // Generates e.g., CM-4829
      
      DERNIERE_COMMANDE_MANUELLE = {
        fourn: fournisseur,
        poNumber: fakePoNumber,
        dateLivraison: dateLivraison
          ? new Date(dateLivraison+'T00:00:00').toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'})
          : '-',
        lignes: toutesLesLignesValides.map(l=>({
          nom:l.nom, variante:l.variante||'', sku:(PRODS.find(x=>x.idVariante===l.idVariante)||{}).skuFourn||'—',
          qte:l.quantite, prix:prixLigneManuelle(l)
        }))
      };
      
      // Save directly to the dashboard's visual memory
      if (!PO_ENVOYES[fournisseur]) PO_ENVOYES[fournisseur] = [];
      PO_ENVOYES[fournisseur].push({poNumber: fakePoNumber, lignes: DERNIERE_COMMANDE_MANUELLE.lignes.map(x => ({idVariante: x.idVariante || '', quantite: x.qte, nom: x.nom, variante: x.variante, sku: x.sku})), date: new Date().toISOString()});
      
      const successText = document.getElementById('mc-success-text');
      if(successText) successText.textContent = '✓ Commande 100% personnalisée créée : ' + fakePoNumber;
      const successZone = document.getElementById('mc-success');
      if(successZone) successZone.style.display = 'flex';
      
      MANUAL_LINES = [];
      renderLignesManuelles();
      rPO(); // Instantly update the dropdowns
      
      btn.disabled = false;
      btn.textContent = 'Créer la commande';
      return;
  }

  // SCENARIO B: Real Shopify Products involved (Send only valid IDs to backend)
  try {
    const resp = await fetch(URL_AS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fournisseur, note, dateLivraison, lignes: lignesShopify }) // Only send Shopify lines
    });

    const data = await resp.json();

    if(data.success){
      DERNIERE_COMMANDE_MANUELLE = {
        fourn: fournisseur,
        poNumber: data.poNumber,
        dateLivraison: dateLivraison
          ? new Date(dateLivraison+'T00:00:00').toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'})
          : '-',
        // Glue the custom products back together with the Shopify products for the PDF
        lignes: toutesLesLignesValides.map(l=>({
          nom:l.nom, variante:l.variante||'', sku:(PRODS.find(x=>x.idVariante===l.idVariante)||{}).skuFourn||'—',
          qte:l.quantite, prix:prixLigneManuelle(l)
        }))
      };
      
      if (!PO_ENVOYES[fournisseur]) PO_ENVOYES[fournisseur] = [];
      PO_ENVOYES[fournisseur].push({poNumber: data.poNumber, lignes: DERNIERE_COMMANDE_MANUELLE.lignes.map(x => ({idVariante: x.idVariante || '', quantite: x.qte, nom: x.nom, variante: x.variante, sku: x.sku})), date: new Date().toISOString()});
      
      const successText = document.getElementById('mc-success-text');
      if(successText) successText.textContent = '✓ Commande créée : ' + data.poNumber + (data.dateAvertissement ? ' — ' + data.dateAvertissement : '');
      const successZone = document.getElementById('mc-success');
      if(successZone) successZone.style.display = 'flex';
      
      MANUAL_LINES = [];
      renderLignesManuelles();
      rPO(); 
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

// =====================================================================
// FONCTIONS D'AJOUT MANUEL ET PERSONNALISÉ (DANS LA VUE PO)
// =====================================================================

// 1. Fait fonctionner la barre de recherche "Ajouter un autre produit..."
function rechercherProduitBlock(fourn, blocId){
    const input = document.getElementById('search-'+blocId);
    const resDiv = document.getElementById('search-res-'+blocId);
    const q = (input?.value||'').toLowerCase().trim();
    
    if(!q){ resDiv.style.display='none'; resDiv.innerHTML=''; return; }

    // Cherche dans le catalogue les produits du fournisseur qui correspondent
    // Searches BOTH the main name and the variant name, and increases the limit to 15
    const matches = PRODS.filter(p => 
        p.fourn === fourn && 
        p.idVariante && 
        (p.nom.toLowerCase().includes(q) || (p.variante && p.variante.toLowerCase().includes(q)))
    ).slice(0, 15);

    if(!matches.length){
        resDiv.style.display='block';
        resDiv.innerHTML='<div style="padding:10px;color:var(--t3);font-size:12px">Aucun résultat trouvé</div>';
        return;
    }

    resDiv.style.display='block';
    resDiv.innerHTML = matches.map(p => {
        // Strict escaping to prevent names with quotes from breaking the HTML button
        const idSafe = String(p.idVariante).replace(/'/g,"\\'").replace(/"/g,"&quot;");
        const fournSafe = String(fourn).replace(/'/g,"\\'").replace(/"/g,"&quot;");
        
        return `<div style="padding:8px 12px;border-bottom:1px solid var(--b1);font-size:12px;display:flex;justify-content:space-between;align-items:center;">
            <div style="flex:1;">
                <div style="font-weight:500">${p.nom}</div>
                ${p.variante ? `<div style="color:var(--t3);font-size:11px">${p.variante}</div>` : ''}
            </div>
            <button class="fb" style="padding:4px 10px;font-size:11px;cursor:pointer;" onclick="ajouterProduitBlock('${fournSafe}','${idSafe}')">+ Ajouter</button>
        </div>`;
    }).join('');
}

// 2. Ajoute le produit trouvé par la barre de recherche au tableau PO
function ajouterProduitBlock(fourn, idVariante){
    const p = PRODS.find(x => x.idVariante === idVariante);
    if(!p) {
        alert("Erreur : Produit introuvable.");
        return;
    }
    
    if(!PO_EXTRAS[fourn]) PO_EXTRAS[fourn] = [];
    
    // Si le produit est déjà ajouté, on augmente juste la quantité
    const existing = PO_EXTRAS[fourn].find(x => x.idVariante === idVariante);
    if(existing) {
        existing.quantite += 1;
    } else {
        PO_EXTRAS[fourn].push({ idVariante: idVariante, nom: p.nom, quantite: 1 });
    }
    
    // Force the search bar to clear itself immediately so you visually see the success
    document.querySelectorAll('[id^="search-res-"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('[id^="search-b"]').forEach(el => el.value = '');
    
    rPO(); // Rafraîchit l'écran pour dessiner la nouvelle ligne
}

// 3. Fait fonctionner le bouton "+ Ajouter" dans la boîte d'alerte jaune
function ajouterHorsPO(idVariante){
    const p = PRODS.find(x => x.idVariante === idVariante);
    if(!p) return;
    
    const input = document.getElementById('qty-hp-'+idVariante);
    const qte = input ? (parseInt(input.value)||1) : 1;
    const fourn = p.fourn;
    
    if(!PO_EXTRAS[fourn]) PO_EXTRAS[fourn] = [];
    
    const existing = PO_EXTRAS[fourn].find(x => x.idVariante === idVariante);
    if(existing) {
        existing.quantite += qte;
    } else {
        PO_EXTRAS[fourn].push({ idVariante: idVariante, nom: p.nom, quantite: qte });
    }
    rPO();
}

// 4. Fait fonctionner le bouton "+ Produit personnalisé" sous le tableau
function ajouterProduitPersonnalise(fourn, blocId){
    const nomInput = document.getElementById('cust-nom-'+blocId);
    const varInput = document.getElementById('cust-var-'+blocId); // 🚀 NEW: Grab Variant Input
    const prixInput = document.getElementById('cust-prix-'+blocId);
    const qteInput = document.getElementById('cust-qte-'+blocId);
    
    const nom = (nomInput?.value||'').trim();
    const variante = (varInput?.value||'').trim(); // 🚀 NEW: Format Variant
    const prix = Math.max(0, parseFloat(prixInput?.value)||0);
    const qte = Math.max(1, parseInt(qteInput?.value)||1);
    
    if(!nom){ alert('Veuillez indiquer un nom de produit.'); return; }
    
    if(!PO_CUSTOM[fourn]) PO_CUSTOM[fourn] = [];
    PO_CUSTOM[fourn].push({
        id: 'custom-' + Date.now(),
        nom: nom,
        variante: variante, // 🚀 NEW: Save Variant to Memory
        prix: prix,
        quantite: qte
    });
    rPO();
}

// ==========================================================
// 🚀 NOUVEAU: CRÉATION DE PRODUIT SHOPIFY PAR L'ÉQUIPE TECHNIQUE
// ==========================================================
// En vue Technique, "Produit personnalisé" crée un vrai produit (ou une variante
// d'un produit existant) dans Shopify, en brouillon, via l'Apps Script (action
// "create_product"). L'Apps Script envoie ensuite un courriel à
// technique@cafeliegeois.ca pour compléter la fiche. La nouvelle variante est
// ajoutée au PO comme une vraie ligne Shopify (incluse dans le transfert).

window.TP_CANDIDATS = {}; // produits parents proposés par la recherche, par bloc

function renderCreationTechnique(fSafe, blocId){
  const champ = 'padding:6px 8px;border:1px solid var(--b2);border-radius:6px;font-size:12px';
  return `<div style="margin-top:10px;padding:12px;border:1px dashed var(--br);border-radius:8px;background:var(--bg)">
    <div style="font-size:12px;font-weight:600;color:var(--t1);margin-bottom:8px">🛠️ Nouveau produit Technique — créé dans Shopify (brouillon) + notification à technique@cafeliegeois.ca</div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <select id="tp-mode-${blocId}" onchange="majModeTechnique('${blocId}')" style="${champ}">
        <option value="nouveau">Nouveau produit</option>
        <option value="variante">Variante d'un produit existant</option>
      </select>
      <div id="tp-parent-zone-${blocId}" style="display:none;position:relative;flex:1.5;min-width:200px">
        <input type="text" id="tp-parent-q-${blocId}" placeholder="🔍 Produit parent (ce fournisseur)…" oninput="rechercherParentTechnique('${fSafe}','${blocId}')" style="width:100%;${champ}">
        <input type="hidden" id="tp-parent-id-${blocId}" value="">
        <div id="tp-parent-res-${blocId}" style="display:none;position:absolute;z-index:50;background:var(--w);border:1px solid var(--b2);border-radius:6px;width:100%;max-height:220px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.08)"></div>
      </div>
      <input type="text" id="tp-nom-${blocId}" placeholder="Nom du produit…" style="flex:1.5;min-width:160px;${champ}">
      <input type="text" id="tp-var-${blocId}" placeholder="Variante (opt.)" style="flex:1;min-width:120px;${champ}">
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <input type="text" id="tp-sku-${blocId}" placeholder="SKU fournisseur" style="width:130px;${champ}">
      <input type="number" min="0" step="0.01" id="tp-cout-${blocId}" placeholder="Coût unit." style="width:90px;text-align:right;${champ}">
      <input type="number" min="0" step="0.01" id="tp-prix-${blocId}" placeholder="Prix vente (opt.)" style="width:120px;text-align:right;${champ}">
      <input type="number" min="1" step="1" value="1" id="tp-qte-${blocId}" placeholder="Qté" style="width:60px;text-align:center;${champ}">
      <button class="fb" id="tp-btn-${blocId}" style="padding:6px 12px;font-size:12px" onclick="creerProduitTechnique('${fSafe}','${blocId}')">+ Créer dans Shopify</button>
    </div>
  </div>`;
}

// Affiche ou cache la recherche du produit parent selon le mode choisi
function majModeTechnique(blocId){
  const mode = document.getElementById('tp-mode-'+blocId)?.value || 'nouveau';
  const zone = document.getElementById('tp-parent-zone-'+blocId);
  const nom = document.getElementById('tp-nom-'+blocId);
  const vari = document.getElementById('tp-var-'+blocId);
  if (zone) zone.style.display = mode === 'variante' ? 'block' : 'none';
  if (nom) nom.style.display = mode === 'variante' ? 'none' : '';
  if (vari) vari.placeholder = mode === 'variante' ? 'Nom de la nouvelle variante (obligatoire)' : 'Variante (opt.)';
}

// Recherche un produit parent chez ce fournisseur (un résultat par produit, pas par variante)
function rechercherParentTechnique(fourn, blocId){
  const q = (document.getElementById('tp-parent-q-'+blocId)?.value || '').toLowerCase().trim();
  const resDiv = document.getElementById('tp-parent-res-'+blocId);
  document.getElementById('tp-parent-id-'+blocId).value = '';
  if (!resDiv) return;
  if (!q) { resDiv.style.display='none'; resDiv.innerHTML=''; return; }

  const vus = new Set();
  const cands = [];
  PRODS.forEach(p => {
    if (p.fourn !== fourn || !p.idVariante) return;
    const titre = p.nb || p.nom;
    if (vus.has(titre) || !titre.toLowerCase().includes(q)) return;
    vus.add(titre);
    cands.push({ id: p.idVariante, titre: titre });
  });
  window.TP_CANDIDATS[blocId] = cands.slice(0, 15);

  resDiv.style.display = 'block';
  resDiv.innerHTML = window.TP_CANDIDATS[blocId].length
    ? window.TP_CANDIDATS[blocId].map((c, i) => `<div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--b1);font-size:12px" onclick="choisirParentTechnique('${blocId}',${i})">${c.titre}</div>`).join('')
    : '<div style="padding:10px;color:var(--t3);font-size:12px">Aucun produit trouvé pour ce fournisseur</div>';
}

function choisirParentTechnique(blocId, i){
  const c = (window.TP_CANDIDATS[blocId] || [])[i];
  if (!c) return;
  document.getElementById('tp-parent-id-'+blocId).value = c.id;
  document.getElementById('tp-parent-q-'+blocId).value = c.titre;
  document.getElementById('tp-parent-res-'+blocId).style.display = 'none';
}

// Envoie la création à l'Apps Script, puis ajoute la nouvelle variante au PO
async function creerProduitTechnique(fourn, blocId){
  const val = id => (document.getElementById(id+'-'+blocId)?.value || '').trim();
  const mode = val('tp-mode') || 'nouveau';
  const parentId = val('tp-parent-id');
  const nom = val('tp-nom');
  const variante = val('tp-var');
  const sku = val('tp-sku');
  const cout = Math.max(0, parseFloat(val('tp-cout')) || 0);
  const prix = Math.max(0, parseFloat(val('tp-prix')) || 0);
  const qte = Math.max(1, parseInt(val('tp-qte'), 10) || 1);

  if (mode === 'nouveau' && !nom) { alert('Indique le nom du nouveau produit.'); return; }
  if (mode === 'variante' && !parentId) { alert('Choisis le produit parent dans la liste de recherche.'); return; }
  if (mode === 'variante' && !variante) { alert('Indique le nom de la nouvelle variante.'); return; }

  const parent = mode === 'variante' ? PRODS.find(x => x.idVariante === parentId) : null;
  const libelle = mode === 'variante' ? ((parent ? (parent.nb || parent.nom) : 'produit parent') + ' — variante « ' + variante + ' »') : (nom + (variante ? ' — ' + variante : ''));
  if (!confirm('Créer dans Shopify (brouillon) :\n\n' + libelle + '\nFournisseur : ' + fourn + '\n\nUne notification sera envoyée à technique@cafeliegeois.ca.')) return;

  const btn = document.getElementById('tp-btn-'+blocId);
  if (btn) { btn.disabled = true; btn.textContent = 'Création…'; }

  try {
    const data = await fetch(URL_AS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'create_product', mode, fournisseur: fourn,
        titre: nom, variante, parentVariantId: parentId,
        sku, cout, prix, quantite: qte
      })
    }).then(r => r.json());

    if (!data.success) {
      alert('Erreur Shopify : ' + (data.error || 'inconnue'));
      if (btn) { btn.disabled = false; btn.textContent = '+ Créer dans Shopify'; }
      return;
    }

    // Injecte la nouvelle variante dans la mémoire du dashboard (sans recharger)
    const idV = String(data.variantId);
    const titreProduit = data.titreProduit || (parent ? (parent.nb || parent.nom) : nom);
    const nomVar = data.nomVariante || '';
    const nomComplet = nomVar ? titreProduit + ' - ' + nomVar : titreProduit;

    PRODS.push({
      nom: nomComplet, nb: titreProduit, variante: nomVar, fourn, statut_produit: 'draft', stock: 0, pareto: 'C',
      en_cmd: 0, statut: 'active', solde: 0, fc_m05: 0, wks_left: null, demande_cumulee: 0,
      vt: 0, vm: 0, vc: 0, sems: {}, vn1: 0, idVariante: idV, skuFourn: sku,
      cout: cout, id: idV, vn1_months: [0,0,0,0,0,0,0,0,0,0,0,0], fc_mois: {}, equipe: 'technique'
    });
    TECH_IDS.add(idV);
    TECH_NOMS.add(nomComplet);
    if (cout > 0) COUT_MAP[idV] = cout;

    // Ajoute la ligne au PO de ce fournisseur (vraie ligne Shopify → incluse dans le transfert)
    if (!PO_EXTRAS[fourn]) PO_EXTRAS[fourn] = [];
    PO_EXTRAS[fourn].push({ idVariante: idV, nom: nomComplet, quantite: qte });

    let msg = '✓ Créé dans Shopify (brouillon) : ' + nomComplet + '\n\n';
    msg += data.notificationEnvoyee
      ? 'Notification envoyée à technique@cafeliegeois.ca.'
      : '⚠️ La notification n\'a pas pu être envoyée : ' + (data.erreurNotification || 'erreur inconnue');
    if (data.avertissements && data.avertissements.length) msg += '\n\nÀ noter :\n- ' + data.avertissements.join('\n- ');
    alert(msg);

    rPO();
  } catch (err) {
    alert('Erreur réseau : ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = '+ Créer dans Shopify'; }
  }
}

// 5. Permet de retirer un produit manuel ou personnalisé du tableau
function retirerExtra(fourn, idVariante){
    if(!PO_EXTRAS[fourn]) return;
    PO_EXTRAS[fourn] = PO_EXTRAS[fourn].filter(x => x.idVariante !== idVariante);
    rPO();
}

function retirerCustom(fourn, customId){
    if(!PO_CUSTOM[fourn]) return;
    PO_CUSTOM[fourn] = PO_CUSTOM[fourn].filter(x => x.id !== customId);
    rPO();
}

// 5.5 Permet de masquer un produit généré par le forecast
function ignorerForecast(fourn, idVariante){
    if(!PO_IGNORED[fourn]) PO_IGNORED[fourn] = [];
    if(!PO_IGNORED[fourn].includes(idVariante)){
        PO_IGNORED[fourn].push(idVariante);
    }
    rPO(); // Rafraîchit l'écran pour faire disparaître la ligne
}

// 6. Recalcule les mathématiques si tu modifies la quantité ou le prix à la main dans le tableau
function majQuantitePO(fourn, idVariante, nom, sem, val, tipo, customId){
    const v = Math.max(0, parseInt(val, 10)||0); // 🚀 FIX: parseInt strictly enforces whole numbers
    
    if(tipo === 'manuel'){
        if(!PO_EXTRAS[fourn]) PO_EXTRAS[fourn] = [];
        let ex = PO_EXTRAS[fourn].find(x => x.idVariante === idVariante);
        if(ex) ex.quantite = v;
    } else if(tipo === 'custom'){
        if(!PO_CUSTOM[fourn]) PO_CUSTOM[fourn] = [];
        let cu = PO_CUSTOM[fourn].find(x => x.id === customId);
        if(cu) cu.quantite = v;
    } else {
        let r = PREVISION.find(x => x.fourn === fourn && (idVariante ? x.idVariante === idVariante : x.nom === nom));
        if(r) {
            r.sems[sem] = v;
        } else {
            // 🚀 FIXED: If a legacy/injected item isn't in PREVISION, save it safely to manual extras!
            if(!PO_EXTRAS[fourn]) PO_EXTRAS[fourn] = [];
            let ex = PO_EXTRAS[fourn].find(x => x.idVariante === idVariante);
            if(ex) ex.quantite = v;
            else PO_EXTRAS[fourn].push({ idVariante: idVariante, nom: nom, quantite: v });
        }
    }
    
    // 🚀 FIX SCROLL JUMP: Save current scroll position
    const cont = document.querySelector('.con');
    const scrollPos = cont ? cont.scrollTop : 0;
    
    rPO(); // Redraws the table
    
    // 🚀 FIX SCROLL JUMP: Instantly restore scroll position
    if (cont) setTimeout(() => cont.scrollTop = scrollPos, 0);
}

function majPrixPO(fourn, nom, val){
    const kOv = fourn + '||' + nom;
    const v = parseFloat(val); // 🚀 Prices stay as floats for 2-decimal cashflow
    if(isNaN(v)) {
        delete PRIX_OVERRIDE[kOv];
    } else {
        PRIX_OVERRIDE[kOv] = Math.max(0, v);
    }
    
    // 🚀 FIX SCROLL JUMP: Save current scroll position
    const cont = document.querySelector('.con');
    const scrollPos = cont ? cont.scrollTop : 0;
    
    rPO(); // Redraws the table
    
    // 🚀 FIX SCROLL JUMP: Instantly restore scroll position
    if (cont) setTimeout(() => cont.scrollTop = scrollPos, 0);
}


function togglePOBlock(fournisseur, idx) {
    // Inverse l'état en mémoire (si undefined, devient true = fermé)
    PO_TOGGLE_STATE[fournisseur] = !PO_TOGGLE_STATE[fournisseur];
    
    const body = document.getElementById('po-body-' + idx);
    const arr = document.getElementById('po-arr-' + idx);
    
    if (PO_TOGGLE_STATE[fournisseur]) {
        body.style.display = 'none';
        arr.textContent = '▶';
    } else {
        body.style.display = 'block';
        arr.textContent = '▼';
    }
}

// ==========================================================
// 14. SCAN-BACK APPLICATION (PARTENAIRES)
// ==========================================================
function rScanback() {
    const targetFourn = document.getElementById('sb-fourn').value;
    const targetYear = parseInt(document.getElementById('sb-year').value);
    const targetMonth = parseInt(document.getElementById('sb-month').value); // 0-11
    
    let tableRows = [];
    let totalRecuGlobal = 0;
    let totalVenduGlobal = 0;

    // --- 1. Agréger les réceptions (Stocky & Transferts) ---
    let recuParId = {};
    let recuAnneeParId = {}; // 🚀 NEW: Tracks the entire year

    function aggregerReceptions(listeCommandes) {
        listeCommandes.forEach(c => {
            if (!c.fourn || !c.fourn.toLowerCase().includes(targetFourn.toLowerCase().split(' ')[0])) return;
            if (!c.livraison || c.livraison === '—') return;
            
            try {
                let d;
                if (c.livraison.includes('/')) {
                    const parts = c.livraison.split('/');
                    d = new Date(parseInt(parts[2]) + 2000, parseInt(parts[1]) - 1, parseInt(parts[0]));
                } else {
                    d = new Date(c.livraison);
                }

                // Si la commande tombe dans l'année sélectionnée
                if (d.getFullYear() === targetYear) {
                    c.lignes.forEach(l => {
                        if (l.idVariante && l.status === 'Reçu') {
                            // 🚀 Add to Yearly Total
                            recuAnneeParId[l.idVariante] = (recuAnneeParId[l.idVariante] || 0) + (l.qty || 0);
                            
                            // 🚀 Add to Monthly Total
                            if (d.getMonth() === targetMonth) {
                                recuParId[l.idVariante] = (recuParId[l.idVariante] || 0) + (l.qty || 0);
                            }
                        }
                    });
                }
            } catch (e) { }
        });
    }

    aggregerReceptions(STOCKY);
    aggregerReceptions(TRANSFERTS);

    
    // --- 2. Parcourir le catalogue pour croiser avec les Ventes ---
    let dataRows = []; // Dictionnaire pour le tri

    PRODS.forEach(p => {
        if (!p.fourn || !p.fourn.toLowerCase().includes(targetFourn.toLowerCase().split(' ')[0])) return;
        if (estTechnique(p)) return; // 🚀 NOUVEAU: les pièces ne comptent pas dans les scan-backs
        
        let venduMois = 0;
        let venduAnnee = 0; 
        let recuMois = recuParId[p.idVariante] || 0;

        // VENTES : Traduction temporelle
        if (targetYear === 2025) {
            venduMois = p.vn1_months[targetMonth] || 0;
            venduAnnee = p.vn1 || 0; 
        } 
        else if (targetYear === 2026) {
            venduAnnee = p.vt || 0; 
            for (let i = 1; i <= 53; i++) {
                let sKey = 'S' + String(i).padStart(2, '0');
                let qtySemaine = p.sems[sKey] || 0;
                
                if (qtySemaine > 0) {
                    let calcMonth = getMonthFromCompanyWeek(i, 2026);
                    if (calcMonth === targetMonth) {
                        venduMois += qtySemaine;
                    }
                }
            }
        }

        if (venduMois <= 0 && recuMois <= 0) return;

        totalRecuGlobal += recuMois;
        totalVenduGlobal += venduMois;
        
        const cleanNom = (p.variante && p.nom.endsWith(' - ' + p.variante)) ? p.nom.slice(0, -(p.variante.length + 3)) : p.nom;

        // Construction de l'objet pour permettre le tri mathématique
        dataRows.push({
            nom: cleanNom,
            variante: p.variante || '',
            sku: p.skuFourn || '',
            recu: recuMois,
            recu_annee: recuAnneeParId[p.idVariante] || 0, // 🚀 NEW
            vendu: venduMois,
            vendu_annee: venduAnnee
        });
    });

    // 🚀 NEW: Appliquer le moteur de tri sur nos données
    const s = SORTS.sb;
    dataRows = sortProds(dataRows, s.col, s.dir);

    // Mapper les objets triés en HTML
    tableRows = dataRows.map(row => {
        return `
        <tr>
            <td>
                <div class="pn">${row.nom}</div>
                ${row.variante ? `<div class="pv">${row.variante}</div>` : ''}
            </td>
            <td style="font-size:12px;color:var(--t3);">${row.sku || '—'}</td>
            <td style="text-align:right; font-weight:${row.recu > 0 ? '600' : '400'}; color:${row.recu > 0 ? 'var(--br)' : 'var(--t3)'};">${fmt(row.recu)}</td>
            <td style="text-align:right; color:var(--t2); font-size:12px;">${fmt(row.recu_annee)}</td>
            <td style="text-align:right; font-weight:600;">${fmt(row.vendu)}</td>
            <td style="text-align:right; font-size:12px; color:var(--t2);">${fmt(row.vendu_annee)}</td>
            <td style="text-align:center;">
                <input type="number" min="0" placeholder="0" style="width: 70px; padding: 4px; border: 1px solid var(--b2); border-radius: 4px; font-size: 12px; text-align: center;">
            </td>
            <td style="text-align:center;">
                <span style="font-size:11px; padding:3px 6px; border-radius:4px; background:var(--amb); color:var(--am);">À traiter</span>
            </td>
        </tr>`;
    });

    // --- 3. Injecter les KPIs ---
    document.getElementById('mg-sb').innerHTML = `
        <div class="mc">
          <div class="mcl">Total Reçu (Mois)</div>
          <div class="mcv ${totalRecuGlobal > 0 ? 'b' : ''}">${fmt(totalRecuGlobal)}</div>
          <div class="mcs">Entrées d'inventaire</div>
        </div>
        <div class="mc">
          <div class="mcl">Total Vendu (Mois)</div>
          <div class="mcv">${fmt(totalVenduGlobal)}</div>
          <div class="mcs">Sorties Shopify</div>
        </div>
        <div class="mc">
          <div class="mcl">Total Déclaré</div>
          <div class="mcv g">0</div>
          <div class="mcs">Soumissions Scan-Back</div>
        </div>
    `;

    document.getElementById('rc-sb').textContent = tableRows.length + ' références actives';
    // NOUVEAU: Le colspan est passé de 6 à 7 pour correspondre à la nouvelle colonne
    document.getElementById('tb-sb').innerHTML = tableRows.join('') || `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--t3)">Aucune donnée pour ce mois</td></tr>`;
}

// ==========================================================
// 15. QUALITÉ DE DONNÉE (MAPPING DES IDs ORPHELINS)
// ==========================================================

function rMapping() {
    const srch = (document.getElementById('s-map')?.value || '').toLowerCase();
    
    // 🚀 NEW: Search Bar Filter Logic
    let filtered = MAPPING_IDS.filter(r => {
        if (srch && !r.nom.toLowerCase().includes(srch) && !r.ancien.includes(srch) && !r.nouveau.includes(srch)) return false;
        return true;
    });

    // Trier la mémoire avec le moteur global
    const rows = sortProds(filtered, SORTS.map.col, SORTS.map.dir);
    
    document.getElementById('rc-map').textContent = rows.length + ' lien(s)';
    
    document.getElementById('tb-mapping').innerHTML = rows.map(r => `
        <tr>
            <td class="pn">${r.nom}</td>
            <td style="color:var(--t2);font-size:12px">${r.variante || '—'}</td>
            <td style="font-family:monospace;color:var(--re);font-weight:600;">${r.ancien}</td>
            <td style="font-family:monospace;color:var(--gr);font-weight:600;">${r.nouveau}</td>
        </tr>
    `).join('') || `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--t3)">Aucun mapping enregistré</td></tr>`;
}

async function enregistrerMapping() {
    const ancien = document.getElementById('map-old').value.replace(/\D/g, '');
    const nouveau = document.getElementById('map-new').value.replace(/\D/g, '');
    const nom = document.getElementById('map-nom').value.trim();
    const variante = document.getElementById('map-var').value.trim();
    
    // 🚀 FIXED: Removed '!fournisseur' so the code doesn't crash looking for a deleted variable
    if(!ancien || !nouveau || !nom) { 
        alert("⚠️ Veuillez remplir l'Ancien ID, le Nouvel ID et le Nom du produit.");
        return;
    }
    
    const btn = document.getElementById('btn-save-map');
    btn.disabled = true;
    btn.textContent = 'Enregistrement...';
    
    try {
        const payload = {
            action: 'mapping',
            ancien: ancien,
            nouveau: nouveau,
            nom: nom,
            variante: variante,
        };
        
        const resp = await fetch(URL_AS, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        
        const data = await resp.json();
        
        if(data.success) {
            alert("✅ Mapping enregistré avec succès ! L'historique des ventes est désormais lié.");
            document.getElementById('map-old').value = '';
            document.getElementById('map-new').value = '';
            document.getElementById('map-nom').value = '';
            document.getElementById('map-var').value = '';
            
            // Recharger le dashboard pour que le nouveau mapping soit injecté dans les VN1
            loadData();
        } else {
            alert("Erreur serveur : " + data.error);
        }
    } catch (err) {
        alert("Erreur réseau : " + err.message + "\n\n(Le script backend doit être mis à jour !)");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Lier les IDs';
    }
}

// ==========================================================
// MODAL : FOURNISSEURS SANS ÉQUIPE
// ==========================================================
function ouvrirModalSansEquipe() {
    const modal = document.getElementById('modal-sans-equipe');
    const cont = document.getElementById('se-liste-fourns');
    if (!modal || !cont) return;

    // Scan unique active suppliers and filter out assigned ones
    // 🚀 NOUVEAU: les pièces (équipe Technique) ne comptent pas — elles n'ont pas besoin du Tableau correspondance
    const sansEquipe = [...new Set(PRODS.filter(p => !estTechnique(p)).map(p => p.fourn))]
        .filter(f => !VENDOR_MAP[f] && f)
        .sort((a, b) => a.localeCompare(b));

    if (sansEquipe.length === 0) {
        cont.innerHTML = `
            <div style="text-align:center;padding:20px;color:var(--gr,#10b981);font-weight:600;font-size:13px">
                ✅ Tous les fournisseurs sont correctement assignés dans le Google Sheet !
            </div>`;
    } else {
        cont.innerHTML = `
            <div style="font-size:12px;font-weight:600;color:var(--t2);margin-bottom:8px">
                ${sansEquipe.length} fournisseur(s) non assigné(s) :
            </div>
            <div style="max-height:220px;overflow-y:auto;border:1px solid var(--b1);border-radius:8px;padding:8px 12px;background:var(--bg,#faf8f5)">
                ${sansEquipe.map(f => `
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--b2,#eee);font-size:13px">
                        <span style="font-weight:500">${f}</span>
                        <span style="font-size:11px;color:var(--re);background:var(--reb);padding:2px 6px;border-radius:4px;font-weight:600">Non assigné</span>
                    </div>
                `).join('')}
            </div>`;
    }

    modal.style.display = 'flex';
}

function fermerModalSansEquipe() {
    const modal = document.getElementById('modal-sans-equipe');
    if (modal) modal.style.display = 'none';
}

// ==========================================================
// NAVIGATION RAPIDE : ALLER AUX RÉCEPTIONS
// ==========================================================
function allerAuxReceptions(nomProduit) {
    // 1. Appuyer sur l'onglet Réceptions dans le menu de gauche
    const btnReceptions = document.querySelectorAll('.ni')[4]; 
    if (btnReceptions) nav('receptions', btnReceptions);

    // 2. Coller le nom du produit dans la barre de recherche
    const searchBar = document.getElementById('s-r');
    if (searchBar) {
        // Enlève la variante s'il y en a une pour une recherche plus large
        const nomPropre = nomProduit.split(' - ')[0]; 
        searchBar.value = nomPropre;

        // 🚀 NOUVEAU : Forcer le menu déroulant sur "Toutes semaines"
        const weekFilter = document.getElementById('sw-r');
        if (weekFilter) weekFilter.value = '';
        
        // 3. Déclencher le filtre
        rReceptions();
    }
}

// ==========================================================
// NAVIGATION RAPIDE : ALLER AUX PROMOS
// ==========================================================
function allerAuxPromos(searchKey) {
    // 1. Appuyer sur l'onglet Promos dans le menu de gauche (Index 8)
    const btnPromos = document.querySelectorAll('.ni')[7]; 
    if (btnPromos) nav('promos', btnPromos);

    // 2. Forcer le filtre "En cours"
    const btnEnCours = document.querySelectorAll('#v-promos .fb')[1]; 
    if (btnEnCours) setPF('active', btnEnCours);

    // 3. Coller le SKU (ou le nom) dans la barre de recherche
    const searchBar = document.getElementById('s-pr');
    if (searchBar) {
        // Enlève la variante s'il y en a une pour une recherche plus large
        const cleanKey = searchKey.split(' - ')[0]; 
        searchBar.value = cleanKey;
        rPromos();
    }
}


// IGNITION: Starts the entire process when the file is loaded
loadData();


// =====================================================================
// MODULE : SURSTOCK & TENDANCE (Analyse achats)
// ---------------------------------------------------------------------
// Données : onglet caché « Analyse achats » de Forecast V4, écrit chaque
// jour par rapportForecastVsReel.gs (fonction majAnalyseDashboard).
//
// Onglet « Surstock à traiter »
//   - 2 grands chiffres : trop de stock / pas assez dans 2 mois
//   - barre « d'où vient le surstock » : commandes prévues (réduire),
//     entrants (décaler), stock en entrepôt (écouler) — clic = filtre
//   - 2 listes TROP / PAS ASSEZ (10 premiers, « voir tous »), une phrase
//     d'explication par produit, bouton Exclure, détail au clic
//   - produits sans forecast ni ventes : à part ; produits exclus : en bas
// Onglet « Forecast vs réalité »
//   - courbe ventes réelles / forecast V4 / N-1 × croissance par semaine,
//     passé + projection ; global ou produit
//   - liste des plus gros écarts sur les 2 dernières semaines
//
// Choix mémorisés dans ce navigateur : exclusions, base de calcul par
// produit, case « inclure les commandes prévues ».
// =====================================================================
let ANA = null;
let ANA_ONGLET = 's';
let ANA_LEV = null;                 // 'c' | 'e' | 's' | null
let ANA_OUVERT = null;              // id du produit déplié
let ANA_TOUS = { trop: false, manque: false, sansfc: false, ecarts: false, sugg: false, sugg2: false };
let ANA_PROD_F = null;              // produit affiché dans « Forecast vs réalité »
let ANA_CHART = null;
const ANA_N = 10;                   // lignes affichées par liste avant « voir tous »
const ANA_BASES = { r: 'Ventes réelles', f: 'Forecast V4', n: 'N-1 × croissance' };
const ANA_LEVIERS = {
  c: { lib: 'Commandes suggérées', col: '#1A6FA8', act: 'pas encore passées → réduire ou annuler' },
  e: { lib: 'Entrants', col: '#A0620A', act: 'déjà commandés → décaler, renégocier' },
  s: { lib: 'Stock en entrepôt', col: '#8A857E', act: 'déjà là → promo, défi vendeurs, transfert' },
};
// Produits promotionnels / liés à un autre produit : pas un vrai surstock
const ANA_EXCLUS_NOMS = ['months of free coffee', 'free coffee bean'];

// ── Préférences mémorisées ───────────────────────────────────────────
function anaLire(cle, def) { try { const v = localStorage.getItem(cle); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
function anaEcrire(cle, v) { try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) {} }
let ANA_CHOIX = anaLire('cl_analyse_bases_v1', {}) || {};
let ANA_EXCLUS = new Set(anaLire('cl_analyse_exclus_v1', []) || []);
let ANA_AVEC_CMD = anaLire('cl_analyse_avec_cmd_v3', false) === true;   // par défaut : stock + entrants seulement

function anaBaseDe(id) { return ANA_CHOIX[id] || 'r'; }
function anaChoisirBase(id, b) {
  if (b === 'r') delete ANA_CHOIX[id]; else ANA_CHOIX[id] = b;
  anaEcrire('cl_analyse_bases_v1', ANA_CHOIX);
  rSurstock();
}
function anaExclure(id, ev) {
  if (ev) ev.stopPropagation();
  ANA_EXCLUS.has(id) ? ANA_EXCLUS.delete(id) : ANA_EXCLUS.add(id);
  anaEcrire('cl_analyse_exclus_v1', [...ANA_EXCLUS]);
  if (ANA_OUVERT === id) ANA_OUVERT = null;
  rSurstock();
}
function anaAvecCmd(on) { ANA_AVEC_CMD = !!on; anaEcrire('cl_analyse_avec_cmd_v3', ANA_AVEC_CMD); rSurstock(); }
function anaLevier(l) { ANA_LEV = (ANA_LEV === l ? null : l); ANA_TOUS.trop = false; rSurstock(); }
function anaToggleTous(k) { ANA_TOUS[k] = !ANA_TOUS[k]; rSurstock(); }
function anaDeplier(id) { ANA_OUVERT = (ANA_OUVERT === id ? null : id); rSurstock(); }
function anaOnglet(o) { ANA_ONGLET = o; rSurstock(); }
function anaProduitF(id) { ANA_PROD_F = id; ANA_ONGLET = 'f'; rSurstock(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function anaOuvrir() { ANA_ONGLET = 's'; ANA_LEV = null; nav('surstock', document.getElementById('ni-surstock')); }

// ── Lecture des données ──────────────────────────────────────────────
function anaN(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let t = String(v ?? '').replace(/[$\s\u00a0\u202f]/g, '');
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.'); else t = t.replace(/,/g, '');
  const x = parseFloat(t);
  return isFinite(x) ? x : 0;
}

function anaCharger() {
  if (ANA && ANA._raw === window.raw) return ANA;
  const t = (window.raw || {})['Analyse achats'];
  ANA = { _raw: window.raw, meta: null, rows: [] };
  if (!t || t.length < 2) return ANA;
  const H = t[0].map(h => String(h || '').trim());
  const c = k => H.indexOf(k);
  const val = (r, k) => c(k) >= 0 ? r[c(k)] : '';
  const json = (v, def) => { try { return JSON.parse(v || '') || def; } catch (e) { return def; } };
  t.slice(1).forEach(r => {
    if (String(r[0]) === '__META__') { ANA.meta = json(r[1], null); return; }
    const id = String(val(r, 'id') || '').replace(/\D/g, '');
    if (!id) return;
    const croiss = val(r, 'croissance');
    const reel = { s1u: anaN(val(r, 'surstock1_u')), s1d: anaN(val(r, 'surstock1_d')), s2u: anaN(val(r, 'surstock2_u')),
                   s2d: anaN(val(r, 'surstock2_d')), m: anaN(val(r, 'manque_d')), ry: 0, rup: '' };
    const sc = json(val(r, 'scenarios'), null), sc0 = json(val(r, 'scenarios_sans_cmd'), null);
    const scen = { r: (sc && sc.r) || reel, f: (sc && sc.f) || reel, n: (sc && sc.n) || reel };
    const hb = json(val(r, 'hebdo'), {});
    ANA.rows.push({
      id, idVariante: id,
      nom: String(val(r, 'nom') || ''), fourn: String(val(r, 'fournisseur') || ''),
      croissance: (croiss === '' || croiss === null || croiss === undefined) ? null : anaN(croiss),
      vendu: anaN(val(r, 'vendu')), fc2s: anaN(val(r, 'forecast_2sem')), n12s: anaN(val(r, 'n1_2sem')),
      fc2m: anaN(val(r, 'forecast_2mois')), n12m: anaN(val(r, 'n1_2mois')),
      stock: anaN(val(r, 'stock')), entrants: anaN(val(r, 'entrants')), cmd: anaN(val(r, 'cmd_prevues')),
      cout: anaN(val(r, 'cout')), sansFc: anaN(val(r, 'sans_forecast')) === 1, dispoD: anaN(val(r, 'dispo_d')),
      scen, scen0: sc0 ? { r: sc0.r || scen.r, f: sc0.f || scen.f, n: sc0.n || scen.n } : scen,
      hb: { r: hb.r || [], f: hb.f || [], n: hb.n || [] },
      se: (() => { const x = json(val(r, 'series'), {}); return { d: x.d || [], c: x.c || [], r: x.r || [], f: x.f || [], n: x.n || [] }; })(),
    });
  });
  return ANA;
}

// Valeurs selon la base choisie et la case « commandes prévues », + répartition par levier
function anaEff(r) {
  const base = anaBaseDe(r.id), jeu = ANA_AVEC_CMD ? r.scen : r.scen0;
  const s = r.sansFc ? { s1u: 0, s1d: 0, s2u: 0, s2d: 0, m: 0, ry: 0, rup: '' } : (jeu[base] || jeu.r);
  const cmd = ANA_AVEC_CMD ? r.cmd : 0;
  const pc = Math.min(s.s2u, cmd), pe = Math.min(s.s2u - pc, r.entrants), ps = Math.max(0, s.s2u - pc - pe);
  const ry = anaN(s.ry);
  // Commandes suggérées (Prevision commandes, arrivée d'ici 2 mois) vs ce qu'il faudrait commander
  // pour couvrir la tendance retenue + le stock de sécurité, compte tenu du stock et des entrants.
  const der = a => anaN((a || [])[(a || []).length - 1]);
  const engage = der(r.se ? r.se.d : null) - der(r.se ? r.se.c : null);
  const besoin = der(r.se ? r.se[base] : null);
  const necessaire = r.sansFc || !r.se || !(r.se.d || []).length ? null : Math.max(0, Math.round(besoin - engage));
  const ecartCmd = necessaire === null ? 0 : r.cmd - necessaire;
  return { ...r, base, cmdEff: cmd, necessaire, ecartCmd, ecartCmd$: ecartCmd * r.cout, s1u: s.s1u, s1d: s.s1d, s2u: s.s2u, s2d: s.s2d, manque: s.m, ry, rup: s.rup || '',
           lev: { c: pc * r.cout, e: pe * r.cout, s: ps * r.cout },
           levDom: pc > 0 ? 'c' : pe > 0 ? 'e' : 's',
           semaines: ry > 0.05 ? (Math.max(0, r.stock) + r.entrants + cmd) / ry : null,
           exclu: ANA_EXCLUS.has(r.id) };
}

// Équipe + exclusions habituelles du dashboard + recherche + fournisseur
function anaVisibles() {
  const srch = (document.getElementById('s-ana')?.value || '').toLowerCase();
  const fourn = document.getElementById('f-ana')?.value || '';
  return anaCharger().rows
    .filter(r => equipeMatch(r.fourn, r) && !estProduitExclu(r.nom) && !(typeof KIT_IDS !== 'undefined' && KIT_IDS.has(r.id))
              && !ANA_EXCLUS_NOMS.some(x => r.nom.toLowerCase().includes(x)))
    .map(anaEff)
    .filter(r => (!fourn || r.fourn === fourn) && (!srch || r.nom.toLowerCase().includes(srch)));
}

function anaTotaux(rows) {
  const t = { trop: 0, tropU: 0, nbTrop: 0, manque: 0, nbManque: 0, sansFcD: 0, nbSansFc: 0, lev: { c: 0, e: 0, s: 0 }, premRup: null };
  rows.forEach(r => {
    if (r.exclu) return;
    if (r.sansFc) { t.sansFcD += r.dispoD; t.nbSansFc++; return; }
    if (r.s2d >= 1) { t.trop += r.s2d; t.tropU += r.s2u; t.nbTrop++; ['c', 'e', 's'].forEach(k => t.lev[k] += r.lev[k]); }
    if (r.manque >= 1) {
      t.manque += r.manque; t.nbManque++;
      if (r.rup && (!t.premRup || anaDateCle(r.rup) < anaDateCle(t.premRup))) t.premRup = r.rup;
    }
  });
  return t;
}
// dd/MM → clé triable (les mois de janvier-février passent après décembre)
function anaDateCle(s) { const [d, m] = s.split('/').map(Number); return (m < 6 ? m + 12 : m) * 100 + d; }

// ── Carte des Alertes ────────────────────────────────────────────────
function anaCarteAlertes() {
  const a = anaCharger();
  if (!a.meta) {
    return `<div class="mc ana-mc" onclick="anaOuvrir()"><div class="mcl">Surstock à 2 mois</div>` +
           `<div class="mcv" style="font-size:16px;color:var(--t3)">Données absentes</div><div class="mcs">Onglet « Analyse achats » non reçu</div></div>`;
  }
  const rows = anaCharger().rows
    .filter(r => equipeMatch(r.fourn, r) && !estProduitExclu(r.nom) && !(typeof KIT_IDS !== 'undefined' && KIT_IDS.has(r.id))
              && !ANA_EXCLUS_NOMS.some(x => r.nom.toLowerCase().includes(x)))
    .map(anaEff);
  const t = anaTotaux(rows);
  return `<div class="mc ana-mc" onclick="anaOuvrir()"><div class="mcl">Trop de stock dans ${a.meta.horizonMois} mois</div>` +
    `<div class="mcv a">${anaK(t.trop)}</div><div class="mcs">${fmt(t.nbTrop)} produits · pas assez ${anaK(t.manque)} · ↗ Analyse</div></div>`;
}

// ── Formats ──────────────────────────────────────────────────────────
function anaK(v) {
  const x = Math.round(anaN(v));
  return Math.abs(x) >= 1e6 ? (x / 1e6).toLocaleString('fr-CA', { maximumFractionDigits: 2 }) + ' M$' : x.toLocaleString('fr-CA') + ' $';
}
function anaPct(v) { return v === null || v === undefined || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + Math.round(v * 100) + ' %'; }
function anaU(x) { return x >= 10 ? fmt(Math.round(x)) : (Math.round(x * 10) / 10).toLocaleString('fr-CA'); }
function anaCoul(prevu, reel) { if (prevu >= 0.5 && prevu > reel * 1.1) return 'ana-hi'; if (prevu < reel * 0.9) return 'ana-lo'; return ''; }
function anaEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

// ── Rendu ────────────────────────────────────────────────────────────
function rSurstock() {
  const a = anaCharger();
  const info = document.getElementById('ana-info');
  document.getElementById('ana-tab-s').classList.toggle('on', ANA_ONGLET === 's');
  document.getElementById('ana-tab-f').classList.toggle('on', ANA_ONGLET === 'f');
  document.getElementById('ana-pane-s').style.display = ANA_ONGLET === 's' ? '' : 'none';
  document.getElementById('ana-pane-f').style.display = ANA_ONGLET === 'f' ? '' : 'none';
  document.getElementById('ana-chk-cmd').style.display = ANA_ONGLET === 's' ? '' : 'none';
  if (!a.meta) {
    info.textContent = '';
    document.getElementById('ana-big').innerHTML = `<div class="ana-vide">Données « Analyse achats » absentes. Lance <b>majAnalyseDashboard()</b> dans Forecast V4, puis <b>construireJsonDashboard()</b>.</div>`;
    return;
  }
  const m = a.meta;
  info.textContent = `Données du ${m.genere.replace('T', ' à ')} · ventes réelles S${m.semDeb}–S${m.semFin} · horizon ${m.horizonMois} mois · ` +
                     `${m.securite} sem. de stock de sécurité · montants au coût`;
  document.getElementById('ana-avec-cmd').checked = ANA_AVEC_CMD;

  // Liste des fournisseurs (selon l'équipe)
  const sel = document.getElementById('f-ana'), fCour = sel.value;
  const tousFourn = [...new Set(a.rows.filter(r => equipeMatch(r.fourn, r)).map(r => r.fourn))].sort((x, y) => x.localeCompare(y, 'fr'));
  sel.innerHTML = '<option value="">Tous les fournisseurs</option>' +
    tousFourn.map(f => `<option value="${anaEsc(f)}"${f === fCour ? ' selected' : ''}>${anaEsc(f)}</option>`).join('');

  const rows = anaVisibles();
  if (ANA_ONGLET === 's') anaRenduSurstock(rows, m); else anaRenduForecast(rows, m);
}

function anaRenduSurstock(rows, m) {
  const t = anaTotaux(rows);
  const nbEx = rows.filter(r => r.exclu).length;
  document.getElementById('ana-big').innerHTML = `
    <div class="ana-bc am"><div class="l">Trop de stock dans ${m.horizonMois} mois</div><div class="v">${anaK(t.trop)}</div>
      <div class="s">${fmt(t.nbTrop)} produits · ${ANA_AVEC_CMD ? 'stock + entrants + commandes suggérées' : 'stock + entrants déjà engagés'}</div></div>
    <div class="ana-bc re"><div class="l">Pas assez dans ${m.horizonMois} mois</div><div class="v">${anaK(t.manque)}</div>
      <div class="s">${fmt(t.nbManque)} produits${t.premRup ? ` · 1re rupture vers le ${t.premRup}` : ''}</div></div>
    <div class="ana-bc ne" onclick="anaToggleTous('sansfc');document.getElementById('ana-sansfc').scrollIntoView({behavior:'smooth'})">
      <div class="l">Sans forecast — à prévoir</div><div class="v">${anaK(t.sansFcD)}</div>
      <div class="s">${fmt(t.nbSansFc)} produits sans forecast ni ventes · non comptés${nbEx ? ` · ${nbEx} exclu(s)` : ''}</div></div>`;

  // Commandes suggérées vs besoin réel
  anaRenduSugg(rows, m);

  // Barre des leviers
  const totLev = t.lev.c + t.lev.e + t.lev.s;
  document.getElementById('ana-lev').innerHTML = totLev < 1 ? '<div class="ana-vide">Aucun surstock.</div>' :
    Object.entries(ANA_LEVIERS).filter(([k]) => t.lev[k] >= 1).map(([k, L]) =>
      `<div class="${ANA_LEV === k ? 'on' : ''}${ANA_LEV && ANA_LEV !== k ? ' off' : ''}" style="flex:${t.lev[k]};background:${L.col}" onclick="anaLevier('${k}')" title="${L.lib} : ${anaK(t.lev[k])}">${L.lib} · ${anaK(t.lev[k])}</div>`).join('');
  document.getElementById('ana-lev-lg').innerHTML = Object.entries(ANA_LEVIERS).map(([k, L]) =>
    `<span><b style="color:${L.col}">${L.lib} · ${anaK(t.lev[k])}</b><br>${L.act}</span>`).join('');
  document.getElementById('ana-lev-reset').style.display = ANA_LEV ? '' : 'none';
  if (!ANA_AVEC_CMD) document.getElementById('ana-lev-lg').insertAdjacentHTML('beforeend', '<span style="color:var(--t3)">Commandes suggérées non comptées : coche « Simuler avec les commandes suggérées » pour les ajouter.</span>');

  // Liste TROP
  const montantTrop = r => ANA_LEV ? r.lev[ANA_LEV] : r.s2d;
  const trop = rows.filter(r => !r.exclu && !r.sansFc && r.s2d >= 1 && (!ANA_LEV || r.lev[ANA_LEV] >= 1))
                   .sort((x, y) => montantTrop(y) - montantTrop(x));
  document.getElementById('ana-t-titre').textContent = ANA_LEV ? `Levier : ${ANA_LEVIERS[ANA_LEV].lib} (${trop.length})` : `Les plus gros surstocks (${trop.length})`;
  const maxT = Math.max(1, ...trop.map(montantTrop));
  document.getElementById('ana-l-trop').innerHTML = anaListe(trop, 'trop', r => anaItem(r, montantTrop(r), maxT, 'am', anaPhraseTrop(r), true));

  // Liste PAS ASSEZ
  const manq = rows.filter(r => !r.exclu && !r.sansFc && r.manque >= 1).sort((x, y) => y.manque - x.manque);
  const maxM = Math.max(1, ...manq.map(r => r.manque));
  document.getElementById('ana-l-manque').innerHTML = anaListe(manq, 'manque', r => anaItem(r, r.manque, maxM, 're', anaPhraseManque(r), false));

  // Sans forecast
  const sf = rows.filter(r => !r.exclu && r.sansFc).sort((x, y) => y.dispoD - x.dispoD);
  document.getElementById('ana-sansfc').innerHTML = !sf.length ? '' : `
    <div class="ana-col ana-sf"><h3 onclick="anaToggleTous('sansfc')" style="cursor:pointer"><span class="ana-pill ne">SANS FORECAST</span>
      <span>À prévoir : ${fmt(sf.length)} produits sans forecast ni ventes · ${anaK(t.sansFcD)} ${ANA_TOUS.sansfc ? '▲' : '▼'}</span></h3>
      ${ANA_TOUS.sansfc ? sf.map(r => anaItem(r, r.dispoD, Math.max(1, ...sf.map(x => x.dispoD)), 'ne',
        `stock ${fmt(r.stock)} · entrants ${fmt(r.entrants)} · commandes prévues ${fmt(r.cmd)} — à ajouter au forecast`, false)).join('') : ''}
    </div>`;

  // Exclus
  const ex = rows.filter(r => r.exclu);
  document.getElementById('ana-exclus').innerHTML = !ex.length ? '' :
    `<span>Exclus des totaux :</span>` + ex.map(r => `<span class="ana-chip" onclick="anaExclure('${r.id}')" title="Cliquer pour réintégrer">${anaEsc(r.nom)} ✕</span>`).join('');
}

function anaRenduSugg(rows, m) {
  const L = rows.filter(r => !r.exclu && !r.sansFc && r.necessaire !== null && (r.cmd > 0 || r.necessaire > 0));
  const trop = L.filter(r => r.ecartCmd >= 1), peu = L.filter(r => r.ecartCmd <= -1);
  const somme = (a, k) => a.reduce((s, r) => s + r[k], 0);
  const sugU = somme(L, 'cmd'), sugD = L.reduce((s, r) => s + r.cmd * r.cout, 0);
  const necU = somme(L, 'necessaire');
  const tropD = somme(trop, 'ecartCmd$'), peuD = -somme(peu, 'ecartCmd$');
  const liste = L.filter(r => Math.abs(r.ecartCmd) >= 1).sort((a, b) => Math.abs(b.ecartCmd$) - Math.abs(a.ecartCmd$));
  const max = Math.max(1, ...liste.map(r => Math.abs(r.ecartCmd$)));
  document.getElementById('ana-sugg').innerHTML = `
    <div class="ana-sugg">
      <div class="ana-sugg-h">
        <div><div class="ana-sugg-t">Tes commandes suggérées sont-elles justes ?</div>
          <div class="ana-sugg-s">Commandes suggérées par ton script (Prevision commandes, arrivée d'ici ${m.horizonMois} mois) comparées à ce qu'il
          faudrait commander pour couvrir la tendance réelle + ${m.securite} sem. de sécurité, avec le stock et les entrants actuels.</div></div>
      </div>
      <div class="ana-sugg-k">
        <div><span>Suggéré</span><b>${fmt(sugU)} u</b><small>${anaK(sugD)}</small></div>
        <div><span>Nécessaire selon la tendance</span><b>${fmt(necU)} u</b></div>
        <div class="am"><span>Suggéré en trop</span><b>${anaK(tropD)}</b><small>${fmt(trop.length)} produits</small></div>
        <div class="re"><span>Pas assez suggéré</span><b>${anaK(peuD)}</b><small>${fmt(peu.length)} produits</small></div>
      </div>
      ${ANA_TOUS.sugg ? anaListe(liste, 'sugg2', r => {
        const t = r.ecartCmd > 0;
        const ph = `suggéré ${fmt(r.cmd)} u · nécessaire selon la tendance ${fmt(r.necessaire)} u → ${t ? fmt(r.ecartCmd) + ' u de plus' : fmt(-r.ecartCmd) + ' u de moins'} que le besoin` +
                   (r.base !== 'r' ? ` · base : ${ANA_BASES[r.base]}` : '');
        return anaItem(r, Math.abs(r.ecartCmd$), max, t ? 'am' : 're', ph, false);
      }) : ''}
      <div class="ana-more"><a href="#" onclick="anaToggleTous('sugg');return false">${ANA_TOUS.sugg ? 'Masquer le détail ▲' : `Voir le détail par produit (${liste.length}) ▼`}</a></div>
    </div>`;
}

function anaListe(liste, cle, rendu) {
  if (!liste.length) return '<div class="ana-vide">Aucun produit.</div>';
  const vis = ANA_TOUS[cle] ? liste : liste.slice(0, ANA_N);
  let h = vis.map(rendu).join('');
  if (liste.length > ANA_N) h += `<div class="ana-more"><a href="#" onclick="anaToggleTous('${cle}');return false">${ANA_TOUS[cle] ? 'Réduire' : `Voir les ${liste.length} produits ↓`}</a></div>`;
  return h;
}

function anaPhraseTrop(r) {
  const p = [];
  p.push(r.semaines === null ? 'aucune vente prévue' : `${fmt(Math.round(r.semaines))} sem. de stock · se vend ${anaU(r.ry)}/sem.`);
  if (r.levDom === 'c') p.push(`${fmt(r.cmdEff)} u en commande prévue`);
  else if (r.levDom === 'e') p.push(`${fmt(r.entrants)} u entrants`);
  else p.push(`${fmt(r.stock)} u déjà en stock`);
  if (r.base !== 'r') p.push(`base : ${ANA_BASES[r.base]}`);
  return p.join(' · ');
}
function anaPhraseManque(r) {
  const p = [r.rup ? `rupture vers le ${r.rup}` : 'sous le stock de sécurité', `se vend ${anaU(r.ry)}/sem.`];
  if (r.vendu > 0 && r.fc2s > 0) { const e = r.vendu / r.fc2s - 1; if (Math.abs(e) >= 0.1) p.push(`ventes ${anaPct(e)} vs forecast`); }
  p.push(r.entrants ? `${fmt(r.entrants)} u entrants` : 'aucun entrant');
  if (r.base !== 'r') p.push(`base : ${ANA_BASES[r.base]}`);
  return p.join(' · ');
}

function anaItem(r, montant, max, ton, phrase, tagLevier) {
  const L = ANA_LEVIERS[r.levDom];
  const tag = tagLevier ? `<span class="ana-tag" style="background:${L.col}">${L.lib}</span>` : '';
  const ouvert = ANA_OUVERT === r.id;
  return `<div class="ana-it${ouvert ? ' ouvert' : ''}" onclick="anaDeplier('${r.id}')">
      <div class="ana-it-l"><div class="ana-it-n">${anaEsc(r.nom)}${tag}</div><div class="ana-it-p">${phrase}</div></div>
      <div class="ana-it-r"><div class="ana-it-v ${ton}">${anaK(montant)}</div>
        <button class="ana-x" onclick="anaExclure('${r.id}',event)" title="Retirer ce produit des totaux">Exclure</button></div>
      <div class="ana-it-b"><i class="${ton}" style="width:${Math.max(2, Math.round(montant / max * 100))}%"></i></div>
      ${ouvert ? anaDetail(r) : ''}
    </div>`;
}

function anaDetail(r) {
  const m = ANA.meta;
  const c = (lib, v, cls) => `<div><span>${lib}</span><b class="${cls || ''}">${v}</b></div>`;
  return `<div class="ana-det" onclick="event.stopPropagation()">
    <div class="ana-det-g">
      ${c(`Ventes réelles S${m.semDeb}–S${m.semFin}`, anaU(r.vendu))}
      ${c('Forecast V4', anaU(r.fc2s), anaCoul(r.fc2s, r.vendu))}
      ${c('N-1 × croissance', anaU(r.n12s), anaCoul(r.n12s, r.vendu))}
      ${c('Croissance N/N-1', anaPct(r.croissance))}
      ${c('Stock actuel', fmt(r.stock))}
      ${c('Entrants', fmt(r.entrants))}
      ${c('Commandes prévues', fmt(r.cmd) + (ANA_AVEC_CMD ? '' : ' (non incluses)'))}
      ${c(`Surstock au ${m.jalons[0]}`, r.s1d >= 1 ? `${fmt(r.s1u)} u · ${anaK(r.s1d)}` : '—')}
      ${c(`Surstock au ${m.jalons[m.jalons.length - 1]}`, r.s2d >= 1 ? `${fmt(r.s2u)} u · ${anaK(r.s2d)}` : '—')}
      ${c('Manque', r.manque >= 1 ? anaK(r.manque) : '—')}
    </div>
    <div class="ana-det-a">
      ${r.sansFc ? '' : `<label>Base de calcul :
        <select class="ana-base${r.base !== 'r' ? ' modif' : ''}" onchange="anaChoisirBase('${r.id}',this.value)">
          ${Object.entries(ANA_BASES).map(([k, lib]) => `<option value="${k}"${k === r.base ? ' selected' : ''}>${lib}</option>`).join('')}
        </select></label>`}
      <button class="fb" onclick="anaProduitF('${r.id}')">Voir forecast vs réalité →</button>
    </div>
  </div>`;
}

// ── Onglet « Forecast vs réalité » ───────────────────────────────────
function anaRenduForecast(rows, m) {
  const base = rows.filter(r => !r.sansFc);
  const prod = ANA_PROD_F ? anaCharger().rows.find(r => r.id === ANA_PROD_F) : null;
  const cible = prod ? [prod] : base;
  document.getElementById('ana-ch-title').textContent = prod ? prod.nom : 'Vue globale';
  document.getElementById('ana-ch-sub').textContent = prod ? prod.fourn :
    `${document.getElementById('f-ana').value || 'Tous les fournisseurs'} · équipe ${typeof libelleEquipe === 'function' ? libelleEquipe() : ''} · ${fmt(base.length)} produits`;
  document.getElementById('ana-f-global').style.display = prod ? '' : 'none';

  const lab = m.semaines || [], NP = m.nbPasse || 0, N = lab.length;
  const somme = k => { const t = new Array(N).fill(0); cible.forEach(r => (r.hb[k] || []).forEach((x, i) => { if (i < N) t[i] += anaN(x); })); return t; };
  const R = somme('r'), F = somme('f'), Nn = somme('n');
  const passe = arr => arr.map((x, i) => i < NP ? x : null);
  const futur = arr => arr.map((x, i) => i >= NP - 1 ? x : null);

  // Badges : biais sur les 2 et les 12 dernières semaines
  const sum = (arr, a, b) => arr.slice(a, b).reduce((s, x) => s + x, 0);
  const biais = (arr, nb) => { const r = sum(R, NP - nb, NP); return r > 0 ? sum(arr, NP - nb, NP) / r - 1 : null; };
  const badge = (lib, b2, b12) => {
    const cls = b2 === null ? 'gr' : b2 > 0.1 ? 'am' : b2 < -0.1 ? 're' : 'gr';
    const sens = b2 === null ? '' : b2 > 0.1 ? 'prévoit trop' : b2 < -0.1 ? 'prévoit trop peu' : 'proche du réel';
    return `<div class="ana-badge ${cls}">${lib} : ${anaPct(b2)} <small>${sens} · 2 dern. sem. · ${anaPct(b12)} sur ${NP} sem.</small></div>`;
  };
  document.getElementById('ana-badges').innerHTML = badge('Forecast V4', biais(F, 2), biais(F, NP)) + badge('N-1 × croissance', biais(Nn, 2), biais(Nn, NP));

  const data = { labels: lab, datasets: [
    { label: 'Ventes réelles', data: R.map((x, i) => i < NP ? x : null), borderColor: '#2D7D46', borderWidth: 4, pointRadius: 3, tension: .25 },
    { label: 'Forecast V4', data: passe(F), borderColor: '#1A6FA8', borderWidth: 2, pointRadius: 0, tension: .25 },
    { label: 'Forecast V4 (projection)', data: futur(F), borderColor: '#1A6FA8', borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: .25 },
    { label: 'N-1 × croissance', data: passe(Nn), borderColor: '#C0392B', borderWidth: 2, pointRadius: 0, tension: .25 },
    { label: 'N-1 × croissance (projection)', data: futur(Nn), borderColor: '#C0392B', borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: .25 },
  ]};
  const ligneAuj = { id: 'anaAuj', beforeDraw(c) {
    const x = c.scales.x, ar = c.chartArea; if (!x || NP < 1) return;
    const px = (x.getPixelForValue(NP - 1) + x.getPixelForValue(Math.min(NP, N - 1))) / 2;
    const ctx = c.ctx; ctx.save(); ctx.fillStyle = 'rgba(128,128,128,0.08)'; ctx.fillRect(px, ar.top, ar.right - px, ar.bottom - ar.top);
    ctx.fillStyle = '#A09C96'; ctx.font = '11px sans-serif'; ctx.fillText('projection →', px + 6, ar.top + 12); ctx.restore(); } };
  const options = { responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { filter: i => i.parsed.y !== null, callbacks: { label: c => ` ${c.dataset.label} : ${anaU(c.parsed.y)} u` } } },
    scales: { x: { grid: { display: false }, ticks: { color: '#A09C96', font: { size: 11 } } },
              y: { beginAtZero: true, grid: { color: '#EEEAE4' }, ticks: { color: '#A09C96', font: { size: 11 }, callback: v => fmt(v) },
                   title: { display: true, text: 'unités / semaine', color: '#A09C96', font: { size: 11 } } } } };
  if (typeof Chart !== 'undefined') {
    if (ANA_CHART) ANA_CHART.destroy();
    ANA_CHART = new Chart(document.getElementById('ana-chart'), { type: 'line', data, options, plugins: [ligneAuj] });
  }

  // Liste des plus gros écarts (en $ au coût, sur les 2 dernières semaines)
  const ec = base.filter(r => r.vendu + r.fc2s >= 1).map(r => ({ r, d: Math.abs(r.fc2s - r.vendu) * r.cout }))
                 .filter(x => x.d >= 1).sort((x, y) => y.d - x.d).map(x => x.r);
  document.getElementById('ana-f-titre').textContent = `Plus gros écarts forecast vs ventes réelles, S${m.semDeb}–S${m.semFin} (${ec.length})`;
  document.getElementById('ana-l-ecarts').innerHTML = anaListe(ec, 'ecarts', r => {
    const e = r.vendu > 0 ? r.fc2s / r.vendu - 1 : null;
    return `<div class="ana-f-row${ANA_PROD_F === r.id ? ' sel' : ''}" onclick="anaProduitF('${r.id}')">
      <span class="n">${anaEsc(r.nom)}<small>${anaEsc(r.fourn)}</small></span>
      <span>${anaU(r.vendu)}</span><span class="${anaCoul(r.fc2s, r.vendu)}">${anaU(r.fc2s)}</span>
      <span class="${anaCoul(r.n12s, r.vendu)}">${anaU(r.n12s)}</span>
      <span class="${e === null ? '' : e > 0.1 ? 'ana-ss' : e < -0.1 ? 'ana-mq' : ''}">${e === null ? 'pas de vente' : anaPct(e)}</span></div>`;
  });
}
