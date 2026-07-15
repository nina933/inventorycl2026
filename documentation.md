# Café Liégeois: Dormant Products Feature Documentation

## Executive Summary
The Dormant Product Feature is an internal financial and operational tool embedded within the Café Liégeois Shopify Admin. Its primary goal is to identify "trapped capital" inventory that occupies warehouse space but is not generating revenue.

By analyzing physical stock levels against historical weekly sales data, this tool **automatically** flags slow-moving products, calculates the exact dollar amount of suspended capital, and allows managers to make data-driven decisions on promotions, liquidations, and purchasing.

### Part 1: How It Works (The Architecture)
This application does not use a traditional "backend server." It is a lightweight, ultra-fast Single Page Application (SPA) written in pure HTML, CSS, and JavaScript.

HTML: Web-Page, the browser.
CSS: The decoration of the website.
Javascript: The system and algorithm of our feature, alongside the rest of the Inventory Dashboard.

Think of it as a three-step pipeline:

1. The Database (Forecast V4 Google Sheets): All raw inventory data, supplier lists, and weekly sales metrics are maintained in a master Google Sheet. Automated tools (like Stocky/Supermetrics) push Shopify data into tabs like Stock produits, Ventes N (Current Year), and Ventes N-1 (Last Year).

2. The Engine (JavaScript): When a user opens the app, the JavaScript file (script.js) reaches out to the Google Sheet, downloads the latest numbers, and performs heavy mathematical calculations directly in the user's web browser.

3. The Display (HTML/CSS): The results are instantly painted onto the screen (index.html) in the form of interactive tables, dropdowns, and KPI cards.

### Part 2: The Core Logic (Demystifying the Code, How it Works)
Even without coding knowledge, it is important to understand how the app thinks to trust its numbers. Here are the two main "smart" scripts powering the tool:

1. The "Universal Key" (Data Normalization)
**The Problem**: In the real world, data is messy. The Stock tab might call a machine "Mahlkonig E80 - Black", but the Sales tab might call it "Mahlkonig E80 Black". To a computer, the missing dash means these are two completely different products, which leads to inaccurate "0 sales" reports.
**The Solution**: The app uses a normalize() function. Before matching data, it strips away all spaces, capital letters, and symbols. Both versions become mahlkonige80black. This creates a perfect "fingerprint" match every time for every product.

2. The "Reverse Traversal" Algorithm
**The Problem**: The Google Sheet does not provide exact dates (like "Sold on April 14th"). It only provides weekly buckets (e.g., "Sold 2 units in Week 12, known as S12").

**The Solution**: The algorithm acts like a detective walking backward. It looks at the current week and steps backward one week at a time. The moment it finds a week with a sale > 0, it stops, records that week as the "Last Sold" date, and counts how many weeks have passed since then. If that number exceeds the user's sensitivity threshold (e.g., 8 weeks, 12 weeks), the product is flagged as Dormant. 

### Part 3: User Guide (Operating the Feature)
The dashboard is designed to be highly interactive. Changing any filter will instantly recalculate the KPIs and update the table.

**Dormant après (semaines)**: The sensitivity dial. Set it to 8 to proactively catch slowing sales, or 12 to identify strictly dead stock. Example: 8 meaning, we want to see products which have not been sold for 8 weeks from today.

**Fournisseurs (Dropdown)**: A multi-select tool. Choose one or multiple suppliers to isolate the trapped capital belonging to specific vendors.
Example: Rocket will output only Rocket vendors. 

**Vélocité** : Choose whether you want to see the product's sales velocity for just the Current Year, or historically (Current Year + Last Year). 
**UPDATE NEEDED** : For future reference, we would need to find a way to bypass when we reach the year 2027. Would 2025 be N-2 or 2026 N-1 instead?
Example: N would mean total sales since the beginning of January of this year, N-1 would mean total sales since January of 2025.

**Trier par (Sort By)** : Sort the table to prioritize what matters today. Sort by Capital Immobilisé to see where the most money is trapped, or by Dernière Vente to see the oldest, most stagnant items. 
**UPDATE NEEDED** : For future reference, we would need to add a way to sort by retail price, thus it would allow us to see our opportunity cost of dormant products. 

### Part 4: Developer Handover (Maintenance & Upgrades)
If you are a beginner taking over this code, do not panic. The application is isolated into three simple files: index.html (the skeleton), styles.css (the paint), and script.js (the brain).

**How to Add a New Feature**
1. Start in HTML: Build the buttons, dropdowns, or table columns in index.html first. Ensure they have unique id tags.

2. Update the Parser: If the new feature requires new data from Google Sheets, update the loadData() function in script.js to capture that specific column.

3. Write the Logic: Create a new function (or update rDormant()) to perform the math.

4. Test via Live Server or Locally: Never double-click the HTML file. Always use a local server extension (like "Live Server" in VS Code) to test your changes, otherwise, your browser will block the app for security reasons.

Essentially, you would want to save a copy of the folders from GitHub, this would allow you to fix, improve, update, and deploy without ever scratching the actual application. 

### Common Errors & How to Fix Them
The "White Screen of Death": If the app refuses to load, you have a syntax error (usually a missing comma or bracket). Press F12 (or Right-Click -> Inspect) also (Cmd + Option + I) to inspect, go to the Console tab, and look at the red text. It will tell you the exact line number causing the crash in script.js.

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

1. Are we taking into account cancellations in the Google Sheets? (ie. ECM Puristikia says last sale was in 2026, Google Sheets says October 2025)

2. KF3 Black: not updated in the Google Sheets (2 in Shopify, 1 in Google Sheets, possible error in Google Apps script?)

3. Things I needed to manually remove:
- 3 MONTHS OF FREE COFFEE - 3 bags x 500g - Local coffee beans 
- DECAF -swiss process - Colombia - LIEGEOIS - our local brand
- NEW WAVE - Coffee beans light roast - Indonesia - Liegeois Our local brand.
- Hoodies.

4. I added an extra filter to remove open box, bundles, returns, demos, refurbished, and 'à vendre en boutique' for the entire application. 

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

5. Addded a 60 seconds load timer. If the application doesn't load in 60 seconds, an error occurs. 


# Entire Javascript explanation

## 1. Executive Summary & Architectural Vision

The Café Liégeois Inventory Dashboard is a bespoke, client-side Single Page Application (SPA). It ingests live supply chain, forecast, and sales data from a Google Sheets pipeline and transforms it into interactive financial and operational insights.

* **Zero-Build Pipeline:** It relies purely on native HTML, CSS, and ES6+ JavaScript. There is no Node.js backend or heavy framework like React. This makes the application lightweight, free to host, and incredibly easy for future developers to maintain.
* **In-Browser Compute (Edge):** Google Sheets acts as a headless database. The app downloads the raw JSON payload and performs all relational joins, normalizations, and mathematical calculations directly within the client's browser.
* **Global State Memory:** The application uses global mutable arrays (e.g., `let PRODS = []`) to hold the database in memory. This allows instantaneous tab-switching and filtering without ever needing a loading screen twice.

---

## 2. Core Utilities (The Developer's Toolbox)

Instead of rewriting standard code, the app relies on "Utility Functions." These act as mini-tools that clean data, format math, and paint UI elements.

### A. The Data Cleaners (Translating Sheets to Code)

Google Sheets data is often messy. These tools clean the data so the computer can do math and match records accurately.

* **`normalize(str)` - The Fingerprinter:** Takes messy text (like "Mahlkonig E80 - Black") and strips away spaces, dashes, and capital letters to create a perfect matchable key (`mahlkonige80black`).

* **`pT(vals)` - The Table Reader ("Parse Table"):** When Google Sheets sends data, it sends a giant, raw grid. This tool reads the top row (headers) and packages the rest into neat JavaScript objects, throwing away empty rows automatically.

* **`n(v)` - The Math Fixer ("Numberify"):** If a cell says `"$ 1,200.50 "`, the computer sees a word. This strips out dollar signs and commas, safely outputting `1200.5`. If a cell is blank, it outputs `0` to prevent math crashes.

### B. The Formatters (Making it Human-Readable)

These tools translate the computer's raw math back into a beautiful French-Canadian format.

* **`fmt(v)` / `fmtM(v)` - The Number/Money Formatters:** Rounds raw numbers (`1234.56`) to clean wholes (`1 235`) or Canadian currency (`1 235 $`).

* **`fmtD(iso)` - The Date Fixer:** Converts giant ugly timestamps (`2026-06-25T04:00...`) into clean dates (`25/06/26`).

* **`cw()` - The Timekeeper:** Calculates exactly what week of the year we are in (1 to 52) to anchor the automated forecasting logic.

### C. The Visual Decorators (Colors & Badges)

These "paintbrushes" look at raw data and generate the HTML to make it look nice on screen.

* **`bP(p)`:** Paints Pareto rank squares (A, B, C).

* **`bS(s, sp)`:** Paints Status Badges. Red for "Rupture" (Out of Stock), Orange for "Critique", and Green for "Actif".

*(Developer Note: Standard dashboard UI elements utilize the core brand identity palette: Primary `#0A497A`, Accent `#0196BB`, and Base `#000000`)*.

---

## 3. Data Ingestion & The "Mini-Phonebooks"

The `loadData()` function is the application's **"Ignition Switch."** Because searching an array of thousands of products repeatedly would freeze the browser (O(n²) time complexity), the app builds "Hash Maps" (Dictionaries) first. These allow for instant O(1) lookups later.

### The Safety Net (`try/catch`)

The entire ingestion is wrapped in a `try { ... } catch(e)` block with an `AbortController`. If the user is on bad Wi-Fi or Google Sheets takes longer than 30 seconds, the fetch aborts and drops a highly visible red banner on the screen rather than crashing silently.

### Building the Phonebooks

Imagine packing 1,000 boxes. It is much faster to build a cheat sheet of delivery times *before* you start packing, rather than looking up the supplier in a spreadsheet for every single box.

* **The Financial Link (`COUT_MAP`):** Specifically checks the "Prix produits" tab, grabs the unit cost, and links it to the product's name. This allows the Dormant Stock tab to calculate trapped capital later.

* **The "Bouncer" Logic (`VN1_MAP`):** When reading historical sales, the code checks `if(!id || id === '') return;`. If a row is missing its unique Shopify Product ID, the app rejects it. This prevents non-retail items (like internal transfers or gift cards) from showing up as "ghost" products with 0 sales.

* **The Two Forecast Methods:** Forecast data is processed twice. `fcMap` is a quick-lookup phonebook so other tabs can instantly ask "What is the forecast for Product X?". `FORECAST` is a structured array used exclusively to draw the visual "Forecast" tab.

---

## 4. The Data Marriage (Stock & Sales)

Because `Ventes N` (Sales) lacks physical inventory data, and `Stock produits` lacks sales velocity, the engine's primary job is to act as a matchmaker.

### Step 1: Process Current Sales (`vMap`)

The engine tallies 53 weeks of sales data for every product and stores it in the `vMap` phonebook using the normalized "Fingerprint" key.

### Step 2: Build the Master Inventory (`PRODS`)

The engine loops through the physical stock list, builds the exact same Fingerprint key, and asks `vMap` for the matching sales velocity.

```javascript
// Example of the Data Marriage
const key = normalize(combinedName); // Build the fingerprint
const vd = vMap[key] || {};          // Instantly grab sales data
const cout_unitaire = COUT_MAP[nom]; // Instantly grab financial data

```

### 💡 Core Logic: Demande Cumulée (Cumulative Demand)

This is the smartest predictive logic in the app. When determining if an item is "Critique", it does not use a static reorder point. It calculates exactly how many units you are forecasted to sell *during the exact number of weeks it takes the supplier to ship new inventory*.
If `Current Stock + In Transit < Projected Sales During Transit`, the item flashes Orange (Critique) to prevent a stockout before it happens.

---

## 5. Purchasing, Logistics & Finance

The app groups individual data rows into cohesive business concepts.

* **Grouping Purchase Orders (`STOCKY`):** A standard spreadsheet lists a PO across 10 different rows (one for each item). The app acts like a cashier, grouping those items into a single "Shopping Cart" object (`byCmd`), labeled with the PO Number so operations can track whole orders at a glance.

* **The Missing PO Auditor (`rPlanRec`):** This tab takes what the automated forecast says you *should* receive and matches it against Stocky's *actual* POs. If a planned delivery has no matching PO in the system, it flags it red.

* **The Budget Math Engine (`BUDGET`):** To project financial burn, the app creates 52 empty buckets (one for each week). It loops through every planned purchase, multiplies `Quantity × Unit Cost`, and drops that dollar amount into the correct weekly bucket, providing automated cash flow forecasting.

---

## 6. UI Routing & Rendering (Traffic Cops & Paintbrushes)

### The Single-Page App (The "Traffic Cop")

Unlike traditional websites, clicking a menu button doesn't load a new page. The `nav()` function acts like a traffic cop. When a user clicks "Stocks," it simply hides the HTML block for the Alertes room and reveals the HTML block for the Stocks room.

### The "Paintbrushes" (`renderView` & `rAlertes`)

Whenever a user switches tabs or changes a filter, a paintbrush function executes:

1. Grabs the master `PRODS` list.
2. Runs it through a filter "gauntlet" (e.g., if the user checked the "Rupture" box, only products with 0 stock survive).
3. Uses `.innerHTML` to draw the remaining products onto the screen.

### Dynamic vs Hardcoded (`populateFiltres`)

The app uses `.map()` and `Set()` to *read the live data* and build the UI dropdowns automatically. This ensures that if Café Liégeois signs a new supplier tomorrow, the dropdown menus update themselves instantly without requiring code maintenance.

---

## 7. The Dormant Stock Engine (Separated Module)

This is an isolated module designed to find trapped capital without altering the master inventory logic.

### 💡 Core Logic: The "Reverse Traversal" Algorithm

Instead of complex date math, the algorithm walks backward through time.
It looks at the current week's sales bucket. If it is `0`, it steps backward one week. It keeps walking backward until it hits a week with a sale `> 0`. The number of steps taken becomes the "Weeks Without Sale" metric. If this exceeds the user's defined threshold (e.g., 8 weeks), the item is flagged as Dormant.

### The Exclusion List

Promotional items or internal merch heavily skew "Dead Stock" financial calculations. A strict exclusion list ignores these specific items before the math begins.

```javascript
// Hardcoded exclusions for specific coffee bundles and apparel items
const lowerName = p.nom.toLowerCase();
const isExcluded = 
    lowerName.includes("3 months of free coffee") ||
    lowerName.includes("decaf -swiss process") ||
    lowerName.includes("new wave - coffee beans") ||
    lowerName.includes("hoodies");

if (isExcluded) return; // Eject from the Dormant Stock calculation

```












### Raw Copy

1. The Data Cleaners (Translating Sheets to Code)
Google Sheets data is often messy (extra spaces, weird characters, dollar signs). These tools clean the data so the computer can do math and match things accurately.

- normalize(str) - The Fingerprinter: Takes any messy text (like "Mahlkonig E80 - Black") and strips away all spaces, dashes, and capital letters to create a perfect matchable key (mahlkonige80black).

- pT(vals) - The Table Reader: "Parse Table". When Google Sheets sends data to the app, it sends it as a giant, raw grid. This tool reads the top row (the headers) and turns the rest of the grid into neat, organized data packages the app can read. It also automatically throws away empty rows.

- n(v) - The Math Fixer: "Numberify". If a cell in Google Sheets says "$ 1,200.50 ", the computer sees a word, not a number. This tool strips out the dollar signs, spaces, and commas, turning it into pure math (1200.5). If a cell is blank, it safely outputs a 0 instead of crashing.

2. The Formatters (Making it Human-Readable)
Computers like raw numbers, but humans like dates and currencies. These tools translate the computer's raw math back into a beautiful French-Canadian format for the screen.

- fmt(v) - The Whole Number Formatter: Takes a raw number (like 1234.56) and rounds it to a clean, formatted whole number (like 1 235).

- fmtM(v) - The Money Formatter: Takes a raw number and turns it into Canadian currency formatting (e.g., 1 235 $).

- fmtD(iso) - The Date Fixer: Computers read dates as giant ugly timestamps (e.g., 2026-06-25T04:00:00.000Z). This tool chops that up and returns a clean, familiar date: 25/06/26.

- cw() - The Timekeeper: "Current Week". It calculates exactly what week of the year we are currently in (from 1 to 52) so the dashboard always knows where to anchor its math.

3. The Visual Decorators (Colors & Badges)
These tools act as the "paintbrushes." They look at a piece of data and automatically generate the HTML code to make it look nice on the screen.

- bP(p) - Pareto Badges: Creates the little colored squares for your Pareto rankings (A, B, or C).

- bS(s, sp) - Status Badges: Reads the status of an item and paints a colored badge: Red for "Rupture" (Out of Stock), Orange for "Critique", and Green for "Actif".

- sc(v) - Stock Colorizer: "Stock Class". It looks at the physical stock number. If the stock is negative, it tags it with red (sn). If the stock is 5 or less, it tags it with orange (sl). Otherwise, it leaves it alone.

- setMsg(m) - The Loading Screen: Updates the text on the white loading screen while the app fetches data (e.g., changing "Connexion à Google Sheets…" to "Parsing des données…").

4. The Team Filters (Routing Suppliers)
These tools handle the buttons at the very top of your app (Nina, Clovis, Tous).

- equipeMatch(fourn): Checks the master phonebook (VENDOR_MAP) to see if a specific supplier belongs to the team member currently selected at the top of the screen.

- setEquipe(eq, el): When you click "Nina" or "Clovis", this function executes. It highlights the button you clicked, filters the supplier dropdown menu to only show their specific vendors, and instantly refreshes the screen.




The try/catch block: Think of try { ... } as a safety net. The app says, "I will try to do all this complicated fetching and math. But if anything goes wrong (like the internet dropping), I will safely catch the error and show it on the screen, rather than just crashing in silence."

The "Mini-Phonebooks" (MAP): Why do we build these first? Imagine you are packing 1,000 boxes (the products). It is much faster to build a cheat sheet of delivery times and team assignments before you start packing, rather than looking up the supplier in a massive spreadsheet for every single box.

- The Financial Link (COUT_MAP): The app does not assume every product has a cost. It specifically checks the "Prix produits" tab, grabs the dollar value, and links it to the product's name. This is the foundation that allows the Dormant Stock tab to calculate trapped capital later.

- The "Bouncer" Logic in Ventes N-1: In the historical sales section, the code explicitly says if(!id || id === '') return;. This acts like a bouncer at a club. If a row of data is missing its unique Shopify/Product ID, the app assumes it's a corrupted row, an empty space, or a deleted product, and refuses to let it into the system. This prevents "ghost" products from showing up with 0 sales.

- The Two Forecast Methods: You might notice the forecast data is processed twice (once into fcMap and once into FORECAST). Why?

        - The fcMap is a quick-lookup phonebook so other tabs (like the PO builder) can instantly ask, "What is the forecast for Product X?"

        - The FORECAST array is a structured list used exclusively to draw the rows on the dedicated "Forecast" visual tab.



The Marriage of Sales and Stock: The code uses two separate loops to process Ventes N and Stock produits. Because Ventes N doesn't have physical inventory numbers, and Stock doesn't have weekly sales velocity, the loadData() function's primary job is to act as a matchmaker. It builds the "Universal Key" fingerprint in both loops, allowing it to seamlessly merge physical logistics with financial velocity into a single profile inside the PRODS array.



The "Demande Cumulée" (Cumulative Demand): This is one of the smartest pieces of logic in the app. When determining if an item is in "Critique" status, the app doesn't just look at a static reorder point. It calculates exactly how many units you are projected to sell during the exact number of weeks it takes the supplier to ship new inventory. If Current Stock < Projected Sales during transit, the item flashes Orange (Critique). This prevents stockouts before they happen.




Grouping the Purchase Orders (STOCKY): A typical spreadsheet lists a Purchase Order across 10 different rows (one for each product). The app's logic acts like a cashier grouping items into a single grocery bag. It builds a "Shopping Cart" object (byCmd), puts all 10 products inside it, and labels it with the PO Number so the user can track whole orders at a glance.

The Budget Math Engine: To project weekly financial burn, the app doesn't rely on complex external tools. It creates 52 empty buckets (one for each week). It loops through every planned purchase, asks the PRIX_MAP phonebook for the unit cost, does the math (Quantity x Cost), and drops that dollar amount into the correct weekly bucket.

The Launch Sequence: Once all the heavy math is done, the app does three final things:

Stamps the Time: It updates the top-right corner to show exactly when the data was pulled.

Paints the Badges: It calculates how many active Promos and incoming POs exist and puts those numbers in the sidebar notification bubbles.

Drops the Curtain: It executes document.getElementById('lov').style.display = 'none';, which turns off the white "Chargement" screen, instantly revealing the fully calculated dashboard underneath.




The Single-Page App (The "Traffic Cop"): Explain that unlike traditional websites where clicking a button forces the browser to load a whole new webpage, this dashboard is a "Single-Page Application" (SPA). All the different screens (Alertes, Stocks, Ventes) are actually stacked on top of each other, hidden from view. The nav() function acts like a traffic cop. When the user clicks "Stocks," it simply turns the lights off in the Alertes room and turns the lights on in the Stocks room. This is why the app feels lightning fast.

The "Paintbrushes" (renderView & rAlertes): Whenever a user switches tabs or changes a filter, a specific "Paintbrush" function is triggered (e.g., rAlertes).

First, it grabs the master PRODS list.

Second, it runs that list through a "gauntlet" (the filter() method). If the user checked the "Rupture" box, only products with 0 stock survive the gauntlet.

Finally, it uses .innerHTML to literally draw the remaining products onto the screen.

Dynamic vs Hardcoded: Point out the populateFiltres() function. Explain the danger of "hardcoding" logic. If we hardcoded a list of 20 suppliers into the HTML, what happens when Café Liégeois signs a 21st supplier? The app would break. Because the filters use .map() and Set() to read the live data, the dropdowns build themselves automatically. The app requires zero maintenance when new suppliers are added.







The "Microscope" Feature (rFourn): The main Alertes and Stocks tabs are like looking at a wide shot of the whole warehouse. The rFourn function acts like a microscope. It forces the user to pick a single supplier first. If they don't pick one, the app intentionally displays a polite blank screen.

Instant Vendor Audits: Once a supplier (e.g., Mahlkonig) is selected, the script rapidly counts how many total products they offer, how many are out of stock (Rupture), and how many are dangerously low (Critique). This allows purchasing managers to instantly audit vendor performance before getting on a phone call with them.

Interactive Filtering: The four summary boxes at the top of the supplier page aren't just for show—they are buttons. When you click the red "Ruptures" box, the JavaScript injects an invisible filter command into the sC() function, instantly narrowing the table below to only show that specific vendor's out-of-stock items.






The "Operations" Tabs (rReceptions & rPlanRec): These tabs are the bridge between purchasing and reality. The Réceptions tab tracks the actual Purchase Orders (POs) generated in Stocky. The PlanRec tab acts like an auditor—it takes what the automated forecast says you should be receiving and matches it against Stocky. If there is a missing PO or a quantity mismatch, it flashes red or yellow to warn the operations team before a stockout occurs.

The "Finance" Tabs (rPO & rBudget): These tabs answer the question, "How much money do we need to spend?" The PO tab generates a ready-to-order shopping list by supplier for the current week. The Budget tab creates 52 distinct buckets (one for each week of the year). It looks at all upcoming required orders, calculates the total capital needed (Quantity × Unit Cost), and drops that dollar amount into the correct weekly bucket, giving management a clear cash flow prediction.

The Plumbing (Dropdowns & UI Mechanics): You will notice several small functions like gC (Get Checked) and sC (Set Checked). This app uses custom-designed floating checkbox menus instead of standard HTML dropdowns. These small "plumbing" functions act as the mechanics—they figure out which boxes are ticked, update the text on the button (e.g., "Fournisseurs (3)"), and ensure the menus close gracefully if the user clicks somewhere else on the screen.

The "Reverse Traversal" Algorithm (rDormant): This is the core engine for finding trapped capital. Instead of doing complicated date math, the algorithm uses "Reverse Traversal." It looks at the current week's sales bucket. If it's empty, it takes one step backward. It keeps walking backward until it hits a week with a number greater than 0. The amount of steps it took becomes the "Weeks without sale" metric. If that number exceeds the user's defined threshold (e.g., 8 weeks), the product is flagged as Dormant, and its trapped capital (Stock × Cost) is added to the financial KPIs.