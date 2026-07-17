# Café Liégeois: Dormant Products Feature Documentation

## Executive Summary
The Dormant Product Feature is an internal financial and operational tool embedded within the Café Liégeois Shopify Admin. Its primary goal is to identify "trapped capital" inventory that occupies warehouse space but is not generating revenue.

By analyzing physical stock levels against historical weekly sales data, this tool **automatically** flags slow-moving products, calculates the exact dollar amount of suspended capital, and allows managers to make data-driven decisions on promotions, liquidations, and purchasing.

### Part 1: How It Works (The Architecture)
This application does not use a traditional "backend server." It is a lightweight, ultra-fast Single Page Application (SPA) written in pure HTML, CSS, and JavaScript.

- HTML: The skeleton of the web page.

- CSS: The visual decoration, layout, and branding.

- JavaScript: The brain of the application. It handles the algorithms, the math, and the logic.

Think of it as a three-step pipeline:

1. The Database (Forecast V4 Google Sheets): All raw inventory data, supplier lists, and weekly sales metrics are maintained in a master Google Sheet. Automated tools (like Stocky/Supermetrics) push Shopify data into tabs like Stock produits, Ventes N (Current Year), Ventes N-1 (Last Year), and Prix produits.

2. The Engine (JavaScript): When a user opens the app, the JavaScript file (script.js) reaches out to the Google Sheet, downloads the latest numbers, and performs heavy mathematical calculations directly in the user's web browser.

3. The Display (HTML/CSS): The results are instantly painted onto the screen (index.html) in the form of interactive tables, dropdowns, and live KPI cards.

### Part 2: The Core Logic (Demystifying the Code, How it Works)
Even without coding knowledge, it is important to understand how the app thinks to trust its numbers. Here are the two main "smart" scripts powering the tool:

1. The "Universal Key" (Data Normalization)

- **The Problem**: In the real world, data is messy. The Stock tab might call a machine "Mahlkonig E80 - Black", but the Sales tab might call it "Mahlkonig E80 Black". To a computer, the missing dash means these are two completely different products, which leads to inaccurate "0 sales" reports. Names may change throughout the years, variants may be added which complicated the naming convention of a product. 

- **The Solution**: The app uses the numerical Shopify Variant ID as the ultimate source of truth. Regardless of how a product is typed, the app matches its sales, cost, and stock using its unique ID string. When IDs aren't available, the app uses a normalize() function to strip away all spaces, capital letters, and symbols to create a perfect "fingerprint" match.

2. The "Reverse Traversal" Algorithm
**The Problem**: The Google Sheet does not provide exact dates (like "Sold on April 14th"). It only provides weekly buckets (e.g., "Sold 2 units in Week 12, known as S12").

**The Solution**: The algorithm acts like a detective walking backward. It looks at the current week and steps backward one week at a time. The moment it finds a week with a sale > 0, it stops, records that week as the "Last Sold" date, and counts how many weeks have passed since then. If that number exceeds the user's sensitivity threshold (e.g., 8 weeks, 12 weeks), the product is flagged as Dormant. 

3. Separation of Finance: Cost vs. Retail Price

- **The Problem**: If you calculate trapped capital using Retail Price, your numbers will be artificially inflated.

- **The Solution**: The app pulls financial data from the Prix produits tab and splits it into two distinct memory banks: COUT_MAP (Unit Cost) and PRIX_MAP (Retail Price). The Purchase Order builder and Dormant Stock calculator strictly use Unit Cost to protect budget accuracy, while the Simulation engine uses Retail Price to calculate potential profit. If a cost is missing from Shopify ($0), the app securely defaults to $0 rather than making up a number.

### Part 3: The Opportunity Cost Simulator (A Non-Technical Guide)
This section explains the logic behind the "Simulation d'Opportunité" card on the Dormant Stock tab.

When we find a dormant product (e.g., 10 old coffee grinders sitting in the warehouse), the app tells us exactly how much money is trapped inside them based on what we paid for them. But what should we do with that information?

The Simulation Engine answers this question: "If we liquidated this dead stock today and freed up that trapped cash, how much profit could we make by reinvesting it into our best-selling Tier A products?"

**Here is exactly how the math works in the background:**

1. Purchasing Power: The app takes the trapped capital (e.g., $1,000) and divides it by the Unit Cost of the Tier A product you selected. (e.g., "We can afford to buy 50 Ascaso machines with this freed-up money.")

2. Market Demand (The Reality Check): The app refuses to assume we can sell infinite machines. It looks at the automated forecast for the next 4 months. If no forecast exists, it looks at true historical weekly averages and projects them forward 16 weeks. (e.g., "The market will only absorb 0.07 Ascaso machines over the next 4 months, which is technically only 1.")

The Constraint: The app plays it safe. It takes the lower of the two numbers. If we can afford 50, but the market only wants 30, the simulation limits our sales to 30.

The Profit Projection: Finally, it multiplies those realistic, constrained units by the Gross Margin (Retail Price - Unit Cost) of the Ascaso, giving you a highly accurate projection of Gross Profit.

It also includes a Custom Simulation box where users can override the math and type in their own quantity to instantly see the profit impact.

### Part 4: User Guide (Operating the Feature)
The dashboard is designed to be highly interactive. Changing any filter will instantly recalculate the KPIs and update the table.

**Filtres d'Équipe (Nina / Clovis / Tous)**: Located at the top right, this routes the entire application to only show suppliers managed by specific team members.

**Dormant après (semaines)**: The sensitivity dial. Set it to 8 to proactively catch slowing sales, or 12 to identify strictly dead stock. Example: 8 meaning, we want to see products which have not been sold for 8 weeks from today.

**Fournisseurs (Dropdown)**: A multi-select tool. Choose one or multiple suppliers to isolate the trapped capital belonging to specific vendors.
Example: Rocket will output only Rocket vendors. 

**Vélocité** : Choose whether you want to see the product's sales velocity for just the Current Year, or historically (Current Year + Last Year). 
**UPDATE NEEDED** : For future reference, we would need to find a way to bypass when we reach the year 2027. Would 2025 be N-2 or 2026 N-1 instead?
Example: N would mean total sales since the beginning of January of this year, N-1 would mean total sales since January of 2025.

**Trier par (Sort By)** : Sort the table to prioritize what matters today. Sort by Capital Immobilisé to see where the most money is trapped, or by Dernière Vente to see the oldest, most stagnant items. 
**UPDATE NEEDED** : For future reference, we would need to add a way to sort by retail price, thus it would allow us to see our opportunity cost of dormant products. 

Construire un PO: The order builder allows you to select a supplier, choose specific upcoming weeks, and generate a Purchase Order. It combines Automated Forecast needs with manual additions, verifies them against your weekly budget ceiling, and automatically generates a clean, downloadable PDF formatted for suppliers. It also syncs the data back to Shopify/Transferts via the loadData backend scripts.

The CSV Export button (Exporter CSV) respects exactly what you see on the screen.
If you set the dormant threshold to 12 weeks and sort by Capital Immobilisé, the downloaded file (Stock_Dormant_YYYY-MM-DD.csv) will be strictly filtered to 12 weeks and sorted perfectly from highest to lowest capital.

### Part 5: Developer Handover (Maintenance & Upgrades)
If you are a beginner taking over this code, do not panic. The application is isolated into three simple files: index.html (the skeleton), styles.css (the paint), and script.js (the brain).

**Standard Exclusions**
In the rDormant() function within script.js, there is a hardcoded exclusion list. The dashboard ignores items containing words like:
"bundle", "return", "demo", "open box", "refurbished", "à vendre en boutique", "hoodies", "gift card"

If you ever want these items to be tracked as dormant stock, simply delete them from the isExcluded logic array in the script.



**How to Add a New Feature**
1. Start in HTML: Build the buttons, dropdowns, or table columns in index.html first. Ensure they have unique id tags.

2. Update the Parser: If the new feature requires new data from Google Sheets, update the loadData() function in script.js to capture that specific column.

3. Write the Logic: Create a new function (or update rDormant()) to perform the math.

4. Test via Live Server or Locally: Never double-click the HTML file. Always use a local server extension (like "Live Server" in VS Code) to test your changes, otherwise, your browser will block the app for security reasons.

Essentially, you would want to save a copy of the folders from GitHub, this would allow you to fix, improve, update, and deploy without ever scratching the actual application. 

### Common Errors & How to Fix Them
The "White Screen of Death": If the app refuses to load, you have a syntax error (usually a missing comma or bracket). Press F12 (or Right-Click -> Inspect) also (Cmd + Option + J) to inspect, go to the Console tab, and look at the red text. It will tell you the exact line number causing the crash in script.js.

Products missing from the list: Check the Google Sheet. The app is programmed to strictly ignore products missing a "Product ID" or items containing the words "Demo", "Bundle", "Refurbished", "Open Box", or "Return".

KPIs showing $0: Ensure the "Prix produits" tab in the Google Sheet hasn't been rearranged. The script expects the Unit Cost to be in a specific column index.

### Part 5: The A.I. Co-Pilot Guide
You do not need to be a senior software engineer to maintain this app; you just need to know how to talk to an AI (like ChatGPT, Claude, or Gemini).

**The Golden Rules for using AI with this application:**

1. Always Set the Context: A.I. cannot read your mind. Start your prompt by explaining the architecture.

Example: "I have a client-side JavaScript application reading data from a Google Apps Script JSON feed. I need to update a function..."

2. Feed it the specific code block: Do not paste the entire 800-line file unless necessary. Copy just the specific function (e.g., rDormant()) and the specific HTML block associated with it.

3. Copy/Paste the Exact Console Error: If the app breaks, do not say "It is broken." Copy the exact red text from the F12 Browser Console (e.g., Uncaught SyntaxError: Identifier 'vd' has already been declared on line 214) and paste it to the AI. It will give you the exact fix in seconds.

4. Ask for "Separation of Concerns": When asking the AI to add a new feature, explicitly ask it to "write this as a new, separated module at the bottom of the script." This prevents the AI from accidentally rewriting or deleting the core loadData() engine.

### CSV Export
The CSV Export option will take into account the filters you have applied. 

For example:

1. The Time Period (Dormant après X semaines) :
If you set this to 12 weeks, the table updates to only show products inactive for 12+ weeks. Your CSV will strictly reflect that shorter, highly stagnant list

2. The Velocity Filter:
This changes the actual numbers printed on the screen. If you select "Année Courante," the CSV's Velocity column will output the smaller number (e.g., 15). If you toggle it to "Historique," the table updates the math, and the CSV will export the larger number (e.g., 145).

3. The Sorting Filter:
If you sort the screen by "Capital Immobilisé" (highest to lowest), the rows in your Excel file will be ordered in that exact same highest-to-lowest sequence.

**What is the Output?**:
When you click export, the JavaScript creates a temporary file named Stock_Dormant_YYYY-MM-DD.csv and triggers a download.

If you open that CSV in Excel or Google Sheets, it will perfectly mirror your dashboard table with 8 columns:

1. Produit & Variante: (e.g., "Mahlkonig E80 - Black")
2. Fournisseur: (e.g., "Mahlkonig")
3. Cat.: (e.g., "A", "B", or "C")
4. Stock: (e.g., "12")
5. Coût Unit.: (e.g., "$ 1,200")
6. Capital Immob.: (e.g., "$ 14,400")
7. Dernière Vente: (e.g., "Semaine 04 (N)" or "Jamais Vendu")
8. Vélocité: (e.g., "25")


### Noticeable Aspects/Questions
Things I needed to manually remove:
- 3 MONTHS OF FREE COFFEE - 3 bags x 500g - Local coffee beans 
- DECAF -swiss process - Colombia - LIEGEOIS - our local brand
- NEW WAVE - Coffee beans light roast - Indonesia - Liegeois Our local brand.
- Hoodies.
- Gift cards.
- Demo, return, bundle, refurbished, open box, etc.

// EXPLICIT EXCLUSION FILTER: Ignore Bundle, Return, Demo, Open Box
      const lowerName = combinedName.toLowerCase();
      if(lowerName.includes('bundle') || lowerName.includes('return') || lowerName.includes('demo') || lowerName.includes('open box') || lowerName.includes('refurbished') || lowerName.includes('à vendre en boutique')) return;

By deleting this, we can change re-add these special case products. 

If you want to strictly add this for the dormant feature only, then add this to the rDormant() function.

// ====================================================
        // NEW FILTER: EXCLUSION LIST (Bundles, specific coffee, hoodies, demos)
        // ====================================================
        const lowerName = p.nom.toLowerCase();
        const isExcluded = 
            lowerName.includes("3 months of free coffee") ||
            lowerName.includes("decaf -swiss process") ||
            lowerName.includes("new wave - coffee beans") ||
            lowerName.includes("hoodies") ||
            lowerName.includes("bundle") ||
            lowerName.includes("return") ||
            lowerName.includes("demo") ||
            lowerName.includes("open box") ||
            lowerName.includes('à vendre en boutique') ||
            lowerName.includes("refurbished");

        // If the product matches any of the names above, skip it immediately
        if (isExcluded) return;
        // ====================================================

- Addded a 60 seconds load timer. If the application doesn't load in 60 seconds, an error occurs. 

# Entire JavaScript Explanation

## 1. Executive Summary & Architectural Vision
The Café Liégeois Inventory Dashboard is a bespoke, client-side Single Page Application (SPA). It ingests live supply chain, forecast, and sales data from a Google Sheets pipeline and transforms it into interactive financial and operational insights.

* Zero-Build Pipeline: It relies purely on native HTML, CSS, and ES6+ JavaScript. There is no Node.js backend or heavy framework like React. This makes the application lightweight, free to host, and incredibly easy for future developers to maintain.

* In-Browser Compute (Edge): Google Sheets acts as a headless database. The app downloads the raw JSON payload and performs all relational joins, normalizations, and mathematical calculations directly within the client's browser.

* Global State Memory: The application uses global mutable arrays (e.g., let PRODS = []) to hold the database in memory. This allows instantaneous tab-switching and filtering without ever needing a loading screen twice.

## 2. Core Utilities (The Developer's Toolbox)
Instead of rewriting standard code, the app relies on "Utility Functions." These act as mini-tools that clean data, format math, and paint UI elements.

### A. The Data Cleaners (Translating Sheets to Code)
Google Sheets data is often messy. These tools clean the data so the computer can do math and match records accurately.

* normalize(str) - The Fingerprinter: Takes messy text (like "Mahlkonig E80 - Black") and strips away spaces, dashes, and capital letters to create a perfect matchable key (mahlkonige80black). It is used as a fallback when numerical IDs are missing.

* pT(vals) - The Table Reader ("Parse Table"): When Google Sheets sends data, it sends a giant, raw grid. This tool reads the top row (headers) and packages the rest into neat JavaScript objects, throwing away empty rows automatically.

* n(v) - The Math Fixer ("Numberify"): If a cell says "$ 1,200.50 ", the computer sees a word. This strips out dollar signs and commas, safely outputting 1200.5. If a cell is blank, it outputs 0 to prevent math crashes.

### B. The Formatters (Making it Human-Readable)
These tools translate the computer's raw math back into a beautiful French-Canadian format.

* fmt(v) / fmtM(v) - The Number/Money Formatters: Rounds raw numbers (1234.56) to clean wholes (1 235) or Canadian currency (1 235 $).

* fmtD(iso) - The Date Fixer: Converts giant ugly timestamps (2026-06-25T04:00...) into clean dates (25/06/26).

* cw() - The Timekeeper: Calculates exactly what week of the year we are in (1 to 52) to anchor the automated forecasting logic.

### C. The Visual Decorators (Colors & Badges)
These "paintbrushes" look at raw data and generate the HTML to make it look nice on screen.

* bP(p): Paints Pareto rank squares (A, B, C).

* bS(s, sp): Paints Status Badges. Red for "Rupture" (Out of Stock), Orange for "Critique", and Green for "Actif".

* sc(v): Colors stock numbers. Negative/zero turns red, 5 or less turns amber.

## 3. Data Ingestion & The "Mini-Phonebooks"
The loadData() function is the application's "Ignition Switch." Because searching an array of thousands of products repeatedly would freeze the browser (O(n²) time complexity), the app builds "Hash Maps" (Dictionaries) first. These allow for instant O(1) lookups later.

#### The Safety Net (try/catch)
The entire ingestion is wrapped in a try { ... } catch(e) block. If the user is on bad Wi-Fi or Google Sheets fails, it drops a highly visible red banner on the screen rather than crashing silently.

#### Building the Phonebooks (The ID Shift)
Imagine packing 1,000 boxes. It is much faster to build a cheat sheet of delivery times before you start packing, rather than looking up the supplier in a spreadsheet for every single box. To ensure perfect accuracy, the app uses the Shopify Variant ID as the absolute source of truth, rather than relying on product names which can have typos.

* Financial Segregation (COUT_MAP vs PRIX_MAP): The app reads the "Prix produits" tab and explicitly splits the money into two phonebooks keyed by Variant ID. COUT_MAP tracks the Unit Cost (what we pay), ensuring Purchase Order budgets and Dormant Capital calculations are strictly grounded in cost. PRIX_MAP tracks the Retail Price (what the customer pays), which is isolated for the Opportunity Simulation engine.

* The "Bouncer" Logic (VN1_MAP & VN1_MONTHLY_MAP): When reading historical sales, the code checks if(!id) return;. If a row is missing its unique Shopify Variant ID, the app rejects it. This prevents non-retail items (like internal transfers or gift cards) from showing up as "ghost" products. It also stores month-by-month historical data for precise dormant tracking.

* The Two Forecast Methods: Forecast data is processed twice. fcMap is a quick-lookup phonebook so other tabs can instantly ask "What is the forecast for Product X?". FORECAST is a structured array used exclusively to draw the visual "Forecast" tab.

## 4. The Data Marriage (Stock & Sales)
Because the Ventes N (Sales) tab lacks physical inventory data, and Stock produits lacks sales velocity, the engine's primary job is to act as a matchmaker.

Step 1: Process Current Sales (vMap)
The engine tallies 53 weeks of sales data for every product and stores it in the vMap phonebook.

Step 2: Build the Master Inventory (PRODS)
The engine loops through the physical stock list, grabs the Variant ID, and asks the phonebooks for the matching sales velocity and financial costs.

```javascript
// Example of the Data Marriage inside the PRODS builder
const idVariante = String(r[4]||'').replace(/\D/g, ''); // Extract Pure ID
const vd = vMapById[idVariante] || {};                 // Instantly grab sales data
const cout_unitaire = COUT_MAP[idVariante] || 0;       // Instantly grab financial cost
```

#### 💡 Core Logic: Demande Cumulée (Cumulative Demand)
This is the smartest predictive logic in the app. When determining if an item is "Critique", it does not use a static reorder point. It calculates exactly how many units you are forecasted to sell during the exact number of weeks it takes the supplier to ship new inventory.
If Current Stock + In Transit < Projected Sales During Transit, the item flashes Orange (Critique) to prevent a stockout before it happens.

## 5. Purchasing, Logistics & PO Management
The app groups individual data rows into cohesive business actions and interacts with the Shopify backend.

* Incoming Shipments (STOCKY & TRANSFERTS): The app ingests data from two different tracking systems. It acts like a cashier, grouping individual products into single "Shopping Carts" (byCmd), labeled with the PO Number so operations can track whole incoming orders at a glance.

* The Smart PO Builder (rPO): This is a highly complex module. It reads the automated forecast, allows the user to select multiple upcoming weeks simultaneously, and generates a shopping list. It integrates custom manual additions (PO_EXTRAS and PO_CUSTOM). Most importantly, it cross-references the PO_ENVOYES memory to hide products that have already been ordered, preventing accidental double-purchasing.

* The Budget Math Engine (BUDGET): To project financial burn, the app creates 52 empty buckets (one for each week). It loops through every planned purchase, multiplies Quantity × Unit Cost (safeguarded by COUT_MAP), and drops that dollar amount into the correct weekly bucket, providing automated cash flow forecasting.

#### Backend Sync & Modal Controllers
The dashboard is not just "read-only"—it writes data back to the business.

* API Connection (envoyerLignesAuBackend): When you click "Créer la commande", this JavaScript sends a JSON package directly to the Google App Script, which parses it and creates a live Transfer inside the Shopify Admin.

* PDF Generator (ouvrirDocumentPO): The app dynamically generates a completely clean, styled HTML page formatted identically to a Shopify invoice. It calculates sub-totals, injects vendor addresses, and triggers the browser's native window.print() capability to save or print physical PDFs for suppliers.

* Modal Overlay Engine: Functions like ouvrirModifPO and ouvrirCommandeManuelle control the pop-up windows. They manage their own temporary arrays (MODIF_PO_LINES) so users can search the catalog, override prices, and adjust quantities safely before committing the data to the backend.

## 6. UI Routing & Rendering (Traffic Cops & Paintbrushes)
#### The Single-Page App (The "Traffic Cop")
Unlike traditional websites, clicking a menu button doesn't load a new page. The nav() function acts like a traffic cop. When a user clicks "Stocks," it simply hides the HTML block for the Alertes room and reveals the HTML block for the Stocks room.

#### The "Paintbrushes" (renderView & rAlertes)
Whenever a user switches tabs or changes a filter, a paintbrush function executes:

1. Grabs the master PRODS list.

2. Runs it through a filter "gauntlet" (e.g., if the user checked the "Rupture" box, only products with 0 stock survive).

3. Uses .innerHTML to draw the remaining products onto the screen.

#### Dynamic Multi-Select Dropdowns (populateFiltres)
The app utilizes custom-built floating dropdown panels (.dd-panel). Functions like populateFournDD() use JavaScript's Set() object to read the live data and build these menus automatically. This ensures that if Café Liégeois signs a new supplier tomorrow, the dropdown menus update themselves instantly without requiring HTML code maintenance.

## 7. The Dormant Stock Engine & Simulation
This is an isolated module designed to flag trapped capital and simulate reinvestment.

#### 💡 Core Logic: The "Reverse Traversal" Algorithm
Instead of complex date math, the algorithm walks backward through time.
It looks at the current week's sales bucket. If it is 0, it steps backward one week. It keeps walking backward until it hits a week with a sale > 0 (even looking into the VN1_MONTHLY_MAP for last year). The number of steps taken becomes the "Weeks Without Sale" metric. If this exceeds the user's defined threshold (e.g., 8 weeks), the item is flagged as Dormant.

#### The Exclusion List
Promotional items, bundles, or internal merch heavily skew "Dead Stock" calculations. A strict exclusion list ignores these specific items before the math begins.

```javaScript
// Hardcoded exclusions
const lowerName = p.nom.toLowerCase();
const isExcluded = lowerName.includes("bundle") || lowerName.includes("demo") || lowerName.includes("return");
if (isExcluded) return; // Eject from the Dormant Stock calculation
```

#### The Opportunity Cost Simulator (simulerLigne)
When a user selects a Tier A product from the simulation dropdown, the app calculates how much profit could be made by reinvesting the trapped capital.

1. Purchasing Power: Divides the Dormant Capital by the Tier A product's Unit Cost (COUT_MAP).

2. Demand Ceiling: Looks at the next 4 months of the automated forecast to see how many units the market will actually absorb. (If no forecast exists, it falls back to 16 weeks of historical pacing).

3. Constraint & Profit: Takes the lower of the two numbers (we can't sell more than the demand ceiling), and multiplies it by the gross margin (PRIX_MAP minus COUT_MAP), outputting a highly accurate projected profit dynamically on the screen.