PetroChina GPP - Inventory Management (Offline Desktop Edition)
================================================================

WHAT THIS IS
------------
A fully self-contained, offline version of the inventory system. It runs entirely
inside your web browser with NO internet connection and NO server required.
You can add/edit items and transactions, import your Excel/CSV data, view
consumption analytics, reorder proposals, and criticality dashboards.

HOW TO RUN
----------
1. Unzip this folder anywhere on your computer (e.g. Desktop).
2. Double-click "index.html". It opens in your default web browser.
   (Chrome, Edge or Firefox recommended.)
3. That's it - start on the "Data / Import" tab to load your item master.

FILES
-----
  index.html   - the application (open this)
  app.js       - application logic
  xlsx.full.min.js - offline Excel/CSV engine (SheetJS)
  logo.png     - branding
  README.txt   - this file

WHERE IS MY DATA STORED?
------------------------
Your data is saved automatically inside the browser you open it with
(browser local storage), so it is still there next time you open index.html
in the SAME browser on the SAME computer.

IMPORTANT - BACK UP YOUR DATA:
Browser storage can be cleared by the browser or lost if you move the folder to
another machine. To keep your data safe and portable:
  - Go to the "Data / Import" tab.
  - Click "Backup to File (.json)" to save a data file to your disk.
  - Use "Restore from File" to load it back (on any computer).

GETTING STARTED
---------------
1. Open the "Data / Import" tab.
2. Click "Download template" if you want the exact column layout, OR just import
   your existing spreadsheet. Recognised item columns:
     Item Code, Description, UOM, Item Type, Criticality (1/2/3),
     Minimum, Maximum, Current/Opening, Unit Rate
3. (Optional) Import transaction history to enable consumption analytics.
4. Explore Dashboard, Inventory, Transactions, and Reorder tabs.

CRITICALITY TIERS
-----------------
  1 = Operations & Maintenance Critical Spares
  2 = Medium Critical Spares
  3 = Normal / Non-Critical

CALCULATIONS (same as the online system)
-----------------------------------------
  Monthly Net Consumption = OUT quantities - "Return from Work Order" (IN)
  Avg Monthly = Cumulative Consumption / months of history
  Avg Yearly  = Avg Monthly x 12
  Safety Stock = Z x StdDev x sqrt(Lead Time)   (Z: Tier 1&2 = 0.842, Tier 3 = 0)
  Recommended Min (ROP) = Avg Monthly x Lead Time + Safety Stock
  Recommended Max = Avg Monthly x Coverage Months + Safety Stock

No data ever leaves your computer.
