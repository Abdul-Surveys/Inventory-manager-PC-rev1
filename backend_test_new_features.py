import requests
import sys
import io
import pandas as pd
from datetime import datetime

BASE_URL = "https://nifty-matsumoto-10.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []
        self.critical_failures = []

    def test(self, name, condition, expected=None, actual=None, critical=False):
        """Run a single test assertion"""
        self.tests_run += 1
        
        if condition:
            self.tests_passed += 1
            print(f"✅ {name}")
            if expected is not None and actual is not None:
                print(f"   Expected: {expected}, Actual: {actual}")
        else:
            self.tests_failed += 1
            self.failures.append(name)
            if critical:
                self.critical_failures.append(name)
            print(f"❌ {name}")
            if expected is not None and actual is not None:
                print(f"   Expected: {expected}, Actual: {actual}")
        return condition

    def api_call(self, method, endpoint, **kwargs):
        """Make API call and return response"""
        url = f"{BASE_URL}/{endpoint}"
        try:
            if method == "GET":
                resp = requests.get(url, timeout=30, **kwargs)
            elif method == "POST":
                resp = requests.post(url, timeout=30, **kwargs)
            elif method == "PUT":
                resp = requests.put(url, timeout=30, **kwargs)
            elif method == "DELETE":
                resp = requests.delete(url, timeout=30, **kwargs)
            return resp
        except Exception as e:
            print(f"❌ API call failed: {method} {endpoint} - {str(e)}")
            return None

    def create_transaction_xlsx(self, transactions):
        """Create xlsx file with transactions"""
        df = pd.DataFrame(transactions)
        buffer = io.BytesIO()
        df.to_excel(buffer, index=False, engine='openpyxl')
        buffer.seek(0)
        return buffer

def main():
    tester = BackendTester()
    print("=" * 80)
    print("PETROCHINA GPP - NEW FEATURES TEST (NET CONSUMPTION + EDIT/DELETE)")
    print("=" * 80)

    # ========================================================================
    # STEP 0: Verify settings are correct (lead 3 / max 6 / non-moving 12)
    # ========================================================================
    print("\n📝 STEP 0: Verifying settings...")
    resp = tester.api_call("GET", "settings")
    if resp and resp.status_code == 200:
        settings = resp.json()
        tester.test("Settings: lead_time_months=3", settings.get('lead_time_months') == 3, 3, settings.get('lead_time_months'))
        tester.test("Settings: max_demand_months=6", settings.get('max_demand_months') == 6, 6, settings.get('max_demand_months'))
        tester.test("Settings: non_moving_months=12", settings.get('non_moving_months') == 12, 12, settings.get('non_moving_months'))
    else:
        print("❌ Cannot verify settings")

    # ========================================================================
    # STEP 1: Clean up item 15996 first (remove all transactions)
    # ========================================================================
    print("\n📝 STEP 1: Cleaning up item 15996...")
    
    # Get all transactions for 15996
    resp = tester.api_call("GET", "transactions?item_code=15996&page_size=200")
    if resp and resp.status_code == 200:
        txns = resp.json().get('transactions', [])
        print(f"   Found {len(txns)} existing transactions for item 15996")
        
        # Delete all transactions
        for txn in txns:
            resp_del = tester.api_call("DELETE", f"transactions/{txn['id']}")
            if resp_del and resp_del.status_code == 200:
                print(f"   Deleted transaction {txn['id']}")
            else:
                print(f"   Failed to delete transaction {txn['id']}")
    
    # Verify item 15996 exists and has qty 0
    resp = tester.api_call("GET", "items/15996")
    if resp and resp.status_code == 200:
        item = resp.json()
        print(f"   Item 15996 current_qty: {item.get('current_qty')}")
        tester.test("Item 15996 exists", True)
    else:
        print("❌ Item 15996 not found - cannot proceed")
        return 1

    # ========================================================================
    # STEP 2: Import controlled transactions for item 15996
    # ========================================================================
    print("\n📝 STEP 2: Importing controlled transactions for item 15996...")
    
    transactions = [
        {"Date": "2026-03-10", "Item Code": "15996", "Direction": "IN", "Quantity": 50, "Transaction Type": "Purchase Order", "Reference No": "TEST-PO-001", "Notes": ""},
        {"Date": "2026-04-05", "Item Code": "15996", "Direction": "OUT", "Quantity": 10, "Transaction Type": "Work Order", "Reference No": "TEST-WO-001", "Notes": ""},
        {"Date": "2026-04-20", "Item Code": "15996", "Direction": "IN", "Quantity": 3, "Transaction Type": "Return from Work Order", "Reference No": "TEST-WO-001-RET", "Notes": ""},
        {"Date": "2026-06-10", "Item Code": "15996", "Direction": "OUT", "Quantity": 6, "Transaction Type": "Work Order", "Reference No": "TEST-WO-002", "Notes": ""},
    ]
    
    xlsx_buffer = tester.create_transaction_xlsx(transactions)
    files = {'file': ('transactions.xlsx', xlsx_buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    
    resp = tester.api_call("POST", "import/transactions?apply_to_stock=true", files=files)
    
    if resp and resp.status_code == 200:
        result = resp.json()
        tester.test("Import transactions for 15996", True, critical=True)
        print(f"   Imported: {result.get('total_imported', 0)} transactions")
    else:
        tester.test("Import transactions for 15996", False, critical=True)
        print(f"   Failed: {resp.status_code if resp else 'No response'} - {resp.text if resp else ''}")
        return 1

    # ========================================================================
    # STEP 3: CRITICAL - Verify NET consumption math
    # ========================================================================
    print("\n📝 STEP 3: CRITICAL - Verifying NET consumption formula...")
    resp = tester.api_call("GET", "items/15996/analysis")
    
    if not resp or resp.status_code != 200:
        tester.test("GET /api/items/15996/analysis", False, critical=True)
        print(f"   Failed: {resp.status_code if resp else 'No response'}")
        return 1
    
    data = resp.json()
    stats = data.get('stats', {})
    item = data.get('item', {})
    monthly = data.get('monthly', [])
    
    print("\n   Verifying NET consumption calculations:")
    
    # Expected values per spec:
    # Total OUT = 10 + 6 = 16
    # WO Returns = 3
    # NET Consumption = 16 - 3 = 13
    # Current stock = 50 - 10 + 3 - 6 = 37
    # Months history = Mar-Aug 2026 = 6 months
    # Monthly series NET = [0, 7, 0, 6, 0, 0] (April: 10 OUT - 3 WO return = 7)
    # Avg monthly = 13 / 6 = 2.1667
    # Std dev = STDEV.S([0, 7, 0, 6, 0, 0]) = 3.37
    # Criticality 3 default -> Z=0, safety_stock=0
    # Rec Min = ceil(2.1667 * 3) = 7
    # Rec Max = ceil(2.1667 * 6) = 13
    # Stock status = OK (37 > 7)
    
    tester.test("total_out", data.get('total_out') == 16, 16, data.get('total_out'), critical=True)
    tester.test("wo_returns", data.get('wo_returns') == 3, 3, data.get('wo_returns'), critical=True)
    tester.test("cumulative_consumption (NET)", stats.get('cumulative_consumption') == 13, 13, stats.get('cumulative_consumption'), critical=True)
    tester.test("months_history", stats.get('months_history') == 6, 6, stats.get('months_history'), critical=True)
    
    # Check avg_monthly_consumption (should be 2.17 rounded)
    avg_monthly = stats.get('avg_monthly_consumption')
    tester.test("avg_monthly_consumption", abs(avg_monthly - 2.17) < 0.01, 2.17, avg_monthly, critical=True)
    
    # Check std dev (should be ~3.37)
    std_dev = stats.get('consumption_std_dev')
    tester.test("consumption_std_dev", abs(std_dev - 3.37) < 0.1, 3.37, std_dev, critical=True)
    
    # Check criticality default
    tester.test("criticality default=3", stats.get('criticality') == 3, 3, stats.get('criticality'))
    tester.test("safety_stock (Z=0)", stats.get('safety_stock') == 0, 0, stats.get('safety_stock'))
    
    # Check recommendations
    tester.test("recommended_min", stats.get('recommended_min') == 7, 7, stats.get('recommended_min'), critical=True)
    tester.test("recommended_max", stats.get('recommended_max') == 13, 13, stats.get('recommended_max'), critical=True)
    
    # Check current stock
    tester.test("current_qty", item.get('current_qty') == 37, 37, item.get('current_qty'), critical=True)
    tester.test("stock_status", stats.get('stock_status') == "OK", "OK", stats.get('stock_status'))
    
    # Check April month entry in monthly array
    april_entry = next((m for m in monthly if m['month'] == '2026-04'), None)
    if april_entry:
        tester.test("April consumption (NET)", april_entry.get('consumption') == 7, 7, april_entry.get('consumption'), critical=True)
        print(f"   April: OUT={april_entry.get('out_qty')}, consumption(NET)={april_entry.get('consumption')}")
    else:
        tester.test("April month entry exists", False, critical=True)

    # ========================================================================
    # STEP 4: Test GET /api/analysis with with_consumption_only=true
    # ========================================================================
    print("\n📝 STEP 4: Testing GET /api/analysis with with_consumption_only=true...")
    resp = tester.api_call("GET", "analysis?with_consumption_only=true")
    
    if resp and resp.status_code == 200:
        data = resp.json()
        rows = data.get('rows', [])
        
        # Find item 15996
        item_15996 = next((r for r in rows if r['item_code'] == '15996'), None)
        
        if item_15996:
            tester.test("Item 15996 appears in analysis", True, critical=True)
            tester.test("Item 15996 total_consumption", item_15996.get('total_consumption') == 13, 13, item_15996.get('total_consumption'))
            tester.test("Item 15996 wo_returns present", 'wo_returns' in item_15996, critical=True)
            tester.test("Item 15996 wo_returns value", item_15996.get('wo_returns') == 3, 3, item_15996.get('wo_returns'))
        else:
            tester.test("Item 15996 appears in analysis", False, critical=True)
    else:
        tester.test("GET /api/analysis", False, critical=True)

    # ========================================================================
    # STEP 5: Test transaction EDIT (PUT /api/transactions/{txn_id})
    # ========================================================================
    print("\n📝 STEP 5: Testing transaction EDIT...")
    
    # Get transactions for 15996
    resp = tester.api_call("GET", "transactions?item_code=15996&page_size=200")
    if resp and resp.status_code == 200:
        txns = resp.json().get('transactions', [])
        
        # Find the OUT transaction with qty 6
        out_txn = next((t for t in txns if t['direction'] == 'OUT' and t['qty'] == 6), None)
        
        if out_txn:
            txn_id = out_txn['id']
            print(f"   Found OUT transaction {txn_id} with qty 6")
            
            # Edit qty from 6 to 9
            resp_edit = tester.api_call("PUT", f"transactions/{txn_id}", json={"qty": 9})
            
            if resp_edit and resp_edit.status_code == 200:
                result = resp_edit.json()
                tester.test("Edit transaction qty 6->9", True, critical=True)
                tester.test("New stock after edit", result.get('new_stock') == 34, 34, result.get('new_stock'), critical=True)
                
                # Verify analysis updated
                resp_analysis = tester.api_call("GET", "items/15996/analysis")
                if resp_analysis and resp_analysis.status_code == 200:
                    data = resp_analysis.json()
                    stats = data.get('stats', {})
                    # New cumulative = 10 + 9 - 3 = 16
                    tester.test("Cumulative after edit", stats.get('cumulative_consumption') == 16, 16, stats.get('cumulative_consumption'), critical=True)
                
                # Edit back to 6
                resp_edit_back = tester.api_call("PUT", f"transactions/{txn_id}", json={"qty": 6})
                if resp_edit_back and resp_edit_back.status_code == 200:
                    tester.test("Edit transaction qty 9->6 (revert)", True)
                    result = resp_edit_back.json()
                    tester.test("Stock after revert", result.get('new_stock') == 37, 37, result.get('new_stock'))
            else:
                tester.test("Edit transaction qty 6->9", False, critical=True)
        else:
            print("   ❌ Could not find OUT transaction with qty 6")

    # ========================================================================
    # STEP 6: Test transaction EDIT validation
    # ========================================================================
    print("\n📝 STEP 6: Testing transaction EDIT validation...")
    
    # Get any transaction
    resp = tester.api_call("GET", "transactions?item_code=15996&page_size=1")
    if resp and resp.status_code == 200:
        txns = resp.json().get('transactions', [])
        if txns:
            txn_id = txns[0]['id']
            
            # Test invalid qty (0)
            resp_invalid = tester.api_call("PUT", f"transactions/{txn_id}", json={"qty": 0})
            if resp_invalid:
                print(f"   qty=0 response: {resp_invalid.status_code}")
                tester.test("Edit with qty=0 rejected (400)", resp_invalid.status_code == 400, 400, resp_invalid.status_code, critical=True)
            
            # Test invalid direction
            resp_invalid = tester.api_call("PUT", f"transactions/{txn_id}", json={"direction": "XX"})
            if resp_invalid:
                print(f"   invalid direction response: {resp_invalid.status_code}")
                tester.test("Edit with invalid direction rejected (400)", resp_invalid.status_code == 400, 400, resp_invalid.status_code, critical=True)
            
            # Test making stock negative (try to OUT more than available)
            resp_invalid = tester.api_call("PUT", f"transactions/{txn_id}", json={"direction": "OUT", "qty": 1000})
            if resp_invalid:
                print(f"   negative stock response: {resp_invalid.status_code}")
                tester.test("Edit causing negative stock rejected (400)", resp_invalid.status_code == 400, 400, resp_invalid.status_code, critical=True)
                if resp_invalid.status_code == 400:
                    print(f"   Error message: {resp_invalid.text}")

    # ========================================================================
    # STEP 7: Test transaction DELETE
    # ========================================================================
    print("\n📝 STEP 7: Testing transaction DELETE...")
    
    # Get transactions for 15996
    resp = tester.api_call("GET", "transactions?item_code=15996&page_size=200")
    if resp and resp.status_code == 200:
        txns = resp.json().get('transactions', [])
        
        # Find the Return from Work Order transaction
        wo_return_txn = next((t for t in txns if t['txn_type'] == 'Return from Work Order'), None)
        
        if wo_return_txn:
            txn_id = wo_return_txn['id']
            print(f"   Found WO Return transaction {txn_id}")
            
            # Delete it
            resp_del = tester.api_call("DELETE", f"transactions/{txn_id}")
            
            if resp_del and resp_del.status_code == 200:
                result = resp_del.json()
                tester.test("Delete WO Return transaction", True, critical=True)
                tester.test("New stock after delete", result.get('new_stock') == 34, 34, result.get('new_stock'), critical=True)
                
                # Verify analysis updated (no return deduction)
                resp_analysis = tester.api_call("GET", "items/15996/analysis")
                if resp_analysis and resp_analysis.status_code == 200:
                    data = resp_analysis.json()
                    stats = data.get('stats', {})
                    # New cumulative = 10 + 6 - 0 = 16 (no WO return)
                    tester.test("Cumulative after delete WO return", stats.get('cumulative_consumption') == 16, 16, stats.get('cumulative_consumption'), critical=True)
            else:
                tester.test("Delete WO Return transaction", False, critical=True)

    # ========================================================================
    # STEP 8: Test DELETE order (blocking negative stock)
    # ========================================================================
    print("\n📝 STEP 8: Testing DELETE order (blocking negative stock)...")
    
    # First, re-import transactions for 15996 since we deleted them
    print("   Re-importing transactions for DELETE test...")
    transactions = [
        {"Date": "2026-03-10", "Item Code": "15996", "Direction": "IN", "Quantity": 50, "Transaction Type": "Purchase Order", "Reference No": "TEST-PO-002", "Notes": ""},
        {"Date": "2026-04-05", "Item Code": "15996", "Direction": "OUT", "Quantity": 10, "Transaction Type": "Work Order", "Reference No": "TEST-WO-004", "Notes": ""},
    ]
    xlsx_buffer = tester.create_transaction_xlsx(transactions)
    files = {'file': ('transactions.xlsx', xlsx_buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    resp = tester.api_call("POST", "import/transactions?apply_to_stock=true", files=files)
    
    # Get all transactions for 15996
    resp = tester.api_call("GET", "transactions?item_code=15996&page_size=200")
    if resp and resp.status_code == 200:
        txns = resp.json().get('transactions', [])
        
        # Find IN and OUT transactions
        in_txn = next((t for t in txns if t['direction'] == 'IN'), None)
        out_txns = [t for t in txns if t['direction'] == 'OUT']
        
        if in_txn and out_txns:
            # Try to delete IN first (should be blocked)
            resp_del_in = tester.api_call("DELETE", f"transactions/{in_txn['id']}")
            if resp_del_in:
                print(f"   Delete IN response: {resp_del_in.status_code}")
                tester.test("Delete IN blocked while OUTs exist (400)", resp_del_in.status_code == 400, 400, resp_del_in.status_code, critical=True)
                if resp_del_in.status_code == 400:
                    print(f"   Error message: {resp_del_in.text}")
            
            # Delete OUT transactions first
            for out_txn in out_txns:
                resp_del_out = tester.api_call("DELETE", f"transactions/{out_txn['id']}")
                if resp_del_out and resp_del_out.status_code == 200:
                    print(f"   Deleted OUT transaction {out_txn['id']}")
            
            # Now delete IN should succeed
            resp_del_in = tester.api_call("DELETE", f"transactions/{in_txn['id']}")
            tester.test("Delete IN succeeds after OUTs deleted", resp_del_in and resp_del_in.status_code == 200, critical=True)
            if resp_del_in and resp_del_in.status_code == 200:
                result = resp_del_in.json()
                tester.test("Stock returns to 0", result.get('new_stock') == 0, 0, result.get('new_stock'))

    # ========================================================================
    # STEP 9: Test reversal endpoint removed (404/405)
    # ========================================================================
    print("\n📝 STEP 9: Testing reversal endpoint removed...")
    
    # Try to call POST /api/transactions/{id}/reverse
    resp = tester.api_call("POST", "transactions/dummy-id/reverse", json={})
    if resp:
        print(f"   Reversal endpoint response: {resp.status_code}")
        tester.test("POST /api/transactions/{id}/reverse returns 404/405", resp.status_code in [404, 405], f"404 or 405", resp.status_code, critical=True)
    else:
        tester.test("POST /api/transactions/{id}/reverse returns 404/405", False, critical=True)

    # ========================================================================
    # STEP 10: Test export analysis with new columns
    # ========================================================================
    print("\n📝 STEP 10: Testing export analysis with new columns...")
    
    resp = tester.api_call("GET", "export/analysis")
    
    if resp and resp.status_code == 200:
        tester.test("GET /api/export/analysis returns 200", True, critical=True)
        tester.test("Export returns xlsx", 'spreadsheet' in resp.headers.get('Content-Type', ''))
        
        # Try to parse xlsx and check for columns
        try:
            df = pd.read_excel(io.BytesIO(resp.content), skiprows=4)
            columns = df.columns.tolist()
            tester.test("Export has 'Total OUT' column", 'Total OUT' in columns, critical=True)
            tester.test("Export has 'WO Returns' column", 'WO Returns' in columns, critical=True)
            print(f"   Columns found: {columns}")
        except Exception as e:
            print(f"   Could not parse xlsx: {e}")
    else:
        tester.test("GET /api/export/analysis returns 200", False, critical=True)

    # ========================================================================
    # STEP 11: Regression tests
    # ========================================================================
    print("\n📝 STEP 11: Running regression tests...")
    
    endpoints = [
        ("GET", "dashboard"),
        ("GET", "reports/monthly-snapshot"),
        ("GET", "reorder"),
        ("GET", "non-moving"),
    ]
    
    for method, endpoint in endpoints:
        resp = tester.api_call(method, endpoint)
        tester.test(f"{method} /api/{endpoint} returns 200", resp and resp.status_code == 200)

    # ========================================================================
    # STEP 12: CLEANUP - Ensure item 15996 is clean
    # ========================================================================
    print("\n📝 STEP 12: CLEANUP - Verifying item 15996 is clean...")
    
    resp = tester.api_call("GET", "items/15996")
    if resp and resp.status_code == 200:
        item = resp.json()
        tester.test("Item 15996 current_qty=0", item.get('current_qty') == 0, 0, item.get('current_qty'))
        tester.test("Item 15996 status=BELOW_MIN", item.get('status') == "BELOW_MIN", "BELOW_MIN", item.get('status'))
        tester.test("Item 15996 total_value=0", item.get('total_value') == 0, 0, item.get('total_value'))
    
    # Check no transactions remain
    resp = tester.api_call("GET", "transactions?item_code=15996")
    if resp and resp.status_code == 200:
        txns = resp.json().get('transactions', [])
        tester.test("Item 15996 has no transactions", len(txns) == 0, 0, len(txns))

    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total tests: {tester.tests_run}")
    print(f"✅ Passed: {tester.tests_passed}")
    print(f"❌ Failed: {tester.tests_failed}")
    
    if tester.critical_failures:
        print(f"\n🚨 CRITICAL FAILURES ({len(tester.critical_failures)}):")
        for failure in tester.critical_failures:
            print(f"  - {failure}")
    
    if tester.tests_failed > 0:
        print("\nAll failed tests:")
        for failure in tester.failures:
            print(f"  - {failure}")
    
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"\nSuccess rate: {success_rate:.1f}%")
    
    if tester.critical_failures:
        print("\n⚠️  CRITICAL FAILURES DETECTED - Main agent must fix these issues")
        return 1
    
    return 0 if tester.tests_failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
