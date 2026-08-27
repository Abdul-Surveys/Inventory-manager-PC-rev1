import requests
import sys
import io
import pandas as pd
import statistics
import math
from datetime import datetime

BASE_URL = "https://nifty-matsumoto-10.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []

    def test(self, name, condition, expected=None, actual=None, tolerance=None):
        """Run a single test assertion"""
        self.tests_run += 1
        if tolerance is not None and expected is not None and actual is not None:
            # Numeric comparison with tolerance
            condition = abs(actual - expected) <= tolerance
        
        if condition:
            self.tests_passed += 1
            print(f"✅ {name}")
            if expected is not None and actual is not None:
                print(f"   Expected: {expected}, Actual: {actual}")
        else:
            self.tests_failed += 1
            self.failures.append(name)
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
    print("PETROCHINA GPP INVENTORY - MIN/MAX RECOMMENDATION ENGINE TEST")
    print("=" * 80)

    # ========================================================================
    # STEP 1: Create test item SPECTEST1
    # ========================================================================
    print("\n📝 STEP 1: Creating test item SPECTEST1...")
    resp = tester.api_call("POST", "items", json={
        "item_code": "SPECTEST1",
        "description": "Test Item for Spec Validation",
        "uom": "PCS",
        "item_type": "Other",
        "criticality": 1,
        "min_qty": 0,
        "max_qty": 0,
        "current_qty": 0,
        "unit_price": 10.0
    })
    
    if resp and resp.status_code == 200:
        tester.test("Create SPECTEST1 item", True)
        print(f"   Item created: {resp.json().get('item_code')}")
    else:
        tester.test("Create SPECTEST1 item", False)
        print(f"   Failed: {resp.status_code if resp else 'No response'} - {resp.text if resp else ''}")
        print("❌ Cannot proceed without test item. Exiting.")
        return 1

    # ========================================================================
    # STEP 2: Import transactions for SPECTEST1
    # ========================================================================
    print("\n📝 STEP 2: Importing transactions for SPECTEST1...")
    transactions = [
        {"Date": "2026-01-10", "Item Code": "SPECTEST1", "Direction": "IN", "Quantity": 100, "Transaction Type": "Purchase Order", "Reference No": "TEST-PO-001", "Notes": ""},
        {"Date": "2026-02-05", "Item Code": "SPECTEST1", "Direction": "OUT", "Quantity": 10, "Transaction Type": "Work Order", "Reference No": "TEST-WO-001", "Notes": ""},
        {"Date": "2026-04-10", "Item Code": "SPECTEST1", "Direction": "OUT", "Quantity": 20, "Transaction Type": "Work Order", "Reference No": "TEST-WO-002", "Notes": ""},
        {"Date": "2026-06-15", "Item Code": "SPECTEST1", "Direction": "OUT", "Quantity": 6, "Transaction Type": "Work Order", "Reference No": "TEST-WO-003", "Notes": ""},
    ]
    
    xlsx_buffer = tester.create_transaction_xlsx(transactions)
    files = {'file': ('transactions.xlsx', xlsx_buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    
    resp = tester.api_call("POST", "import/transactions?apply_to_stock=true", files=files)
    
    if resp and resp.status_code == 200:
        result = resp.json()
        tester.test("Import transactions", True)
        print(f"   Imported: {result.get('total_imported', 0)} transactions")
    else:
        tester.test("Import transactions", False)
        print(f"   Failed: {resp.status_code if resp else 'No response'} - {resp.text if resp else ''}")
        print("❌ Cannot proceed without transactions. Exiting.")
        return 1

    # ========================================================================
    # STEP 3: Verify analysis calculations (CRITICAL TEST)
    # ========================================================================
    print("\n📝 STEP 3: Verifying analysis calculations for SPECTEST1 (CRITICAL)...")
    resp = tester.api_call("GET", "items/SPECTEST1/analysis")
    
    if not resp or resp.status_code != 200:
        tester.test("GET /api/items/SPECTEST1/analysis", False)
        print(f"   Failed: {resp.status_code if resp else 'No response'}")
        return 1
    
    data = resp.json()
    stats = data.get('stats', {})
    item = data.get('item', {})
    
    print("\n   Verifying statistical calculations:")
    
    # Expected values based on spec
    expected_first_in = "2026-01-10"
    expected_months_history = 8  # Jan 2026 through Aug 2026
    expected_cumulative = 36  # 10 + 20 + 6
    expected_avg_monthly = 4.5  # 36 / 8
    
    # Calculate expected std dev: [0, 10, 0, 20, 0, 6, 0, 0]
    monthly_series = [0, 10, 0, 20, 0, 6, 0, 0]
    expected_std_dev = round(statistics.stdev(monthly_series), 2)  # Should be ~7.52
    
    expected_lead_time_demand = round(expected_avg_monthly * 3, 2)  # 13.5
    expected_safety_stock = round(0.842 * expected_std_dev * math.sqrt(3), 2)  # ~10.97
    expected_rec_min = math.ceil(expected_lead_time_demand + expected_safety_stock)  # 25
    expected_six_month_demand = round(expected_avg_monthly * 6, 2)  # 27
    expected_rec_max = math.ceil(expected_six_month_demand + expected_safety_stock)  # 38
    expected_current_qty = 64  # 100 - 36
    expected_stock_status = "OK"  # 64 > 25
    expected_confidence = "NORMAL"  # 8 months, 5/8 zero = 62.5% <= 66%
    
    # Run tests
    tester.test("first_in_date", stats.get('first_in_date') == expected_first_in, expected_first_in, stats.get('first_in_date'))
    tester.test("months_history", stats.get('months_history') == expected_months_history, expected_months_history, stats.get('months_history'))
    tester.test("cumulative_consumption", stats.get('cumulative_consumption') == expected_cumulative, expected_cumulative, stats.get('cumulative_consumption'))
    tester.test("avg_monthly_consumption", stats.get('avg_monthly_consumption') == expected_avg_monthly, expected_avg_monthly, stats.get('avg_monthly_consumption'))
    tester.test("consumption_std_dev", stats.get('consumption_std_dev'), expected_std_dev, stats.get('consumption_std_dev'), tolerance=0.01)
    tester.test("lead_time_demand", stats.get('lead_time_demand') == expected_lead_time_demand, expected_lead_time_demand, stats.get('lead_time_demand'))
    tester.test("safety_stock", stats.get('safety_stock'), expected_safety_stock, stats.get('safety_stock'), tolerance=0.01)
    tester.test("recommended_min", stats.get('recommended_min') == expected_rec_min, expected_rec_min, stats.get('recommended_min'))
    tester.test("six_month_demand", stats.get('six_month_demand') == expected_six_month_demand, expected_six_month_demand, stats.get('six_month_demand'))
    tester.test("recommended_max", stats.get('recommended_max') == expected_rec_max, expected_rec_max, stats.get('recommended_max'))
    tester.test("current_qty", item.get('current_qty') == expected_current_qty, expected_current_qty, item.get('current_qty'))
    tester.test("stock_status", stats.get('stock_status') == expected_stock_status, expected_stock_status, stats.get('stock_status'))
    tester.test("confidence", stats.get('confidence') == expected_confidence, expected_confidence, stats.get('confidence'))
    tester.test("criticality", stats.get('criticality') == 1, 1, stats.get('criticality'))
    tester.test("service_level", stats.get('service_level') == 80, 80, stats.get('service_level'))
    tester.test("z_value", stats.get('z_value') == 0.842, 0.842, stats.get('z_value'))

    # ========================================================================
    # STEP 4: Change criticality to 3 and verify
    # ========================================================================
    print("\n📝 STEP 4: Changing criticality to 3 and verifying...")
    resp = tester.api_call("PUT", "items/SPECTEST1", json={"criticality": 3})
    
    if resp and resp.status_code == 200:
        tester.test("Update criticality to 3", True)
    else:
        tester.test("Update criticality to 3", False)
        print(f"   Failed: {resp.status_code if resp else 'No response'}")
    
    # Verify new calculations
    resp = tester.api_call("GET", "items/SPECTEST1/analysis")
    if resp and resp.status_code == 200:
        data = resp.json()
        stats = data.get('stats', {})
        
        # With criticality 3: Z=0, safety_stock=0
        expected_rec_min_c3 = math.ceil(13.5)  # 14
        expected_rec_max_c3 = math.ceil(27)  # 27
        
        tester.test("criticality=3: z_value", stats.get('z_value') == 0, 0, stats.get('z_value'))
        tester.test("criticality=3: safety_stock", stats.get('safety_stock') == 0, 0, stats.get('safety_stock'))
        tester.test("criticality=3: recommended_min", stats.get('recommended_min') == expected_rec_min_c3, expected_rec_min_c3, stats.get('recommended_min'))
        tester.test("criticality=3: recommended_max", stats.get('recommended_max') == expected_rec_max_c3, expected_rec_max_c3, stats.get('recommended_max'))

    # ========================================================================
    # STEP 5: Test GET /api/analysis
    # ========================================================================
    print("\n📝 STEP 5: Testing GET /api/analysis...")
    resp = tester.api_call("GET", "analysis")
    
    if resp and resp.status_code == 200:
        data = resp.json()
        tester.test("GET /api/analysis returns 200", True)
        tester.test("analysis has rows", 'rows' in data)
        tester.test("analysis has report_review_date", 'report_review_date' in data)
        tester.test("analysis has settings", 'settings' in data)
        
        # Check if SPECTEST1 appears
        rows = data.get('rows', [])
        spectest1_found = any(r.get('item_code') == 'SPECTEST1' for r in rows)
        tester.test("SPECTEST1 appears in analysis", spectest1_found)
        
        # Test with_consumption_only toggle
        resp2 = tester.api_call("GET", "analysis?with_consumption_only=true")
        if resp2 and resp2.status_code == 200:
            tester.test("GET /api/analysis?with_consumption_only=true", True)
    else:
        tester.test("GET /api/analysis returns 200", False)

    # ========================================================================
    # STEP 6: Test GET /api/settings
    # ========================================================================
    print("\n📝 STEP 6: Testing GET /api/settings...")
    resp = tester.api_call("GET", "settings")
    
    if resp and resp.status_code == 200:
        settings = resp.json()
        tester.test("GET /api/settings returns 200", True)
        tester.test("settings has lead_time_months", 'lead_time_months' in settings)
        tester.test("settings has max_demand_months", 'max_demand_months' in settings)
        tester.test("settings has non_moving_months", 'non_moving_months' in settings)
        tester.test("lead_time_months default is 3", settings.get('lead_time_months') == 3, 3, settings.get('lead_time_months'))
        tester.test("max_demand_months default is 6", settings.get('max_demand_months') == 6, 6, settings.get('max_demand_months'))
        tester.test("non_moving_months default is 12", settings.get('non_moving_months') == 12, 12, settings.get('non_moving_months'))
    else:
        tester.test("GET /api/settings returns 200", False)

    # ========================================================================
    # STEP 7: Test PUT /api/settings
    # ========================================================================
    print("\n📝 STEP 7: Testing PUT /api/settings...")
    resp = tester.api_call("PUT", "settings", json={
        "lead_time_months": 3,
        "max_demand_months": 6,
        "non_moving_months": 12
    })
    
    if resp and resp.status_code == 200:
        tester.test("PUT /api/settings returns 200", True)
        settings = resp.json()
        tester.test("PUT settings: lead_time_months", settings.get('lead_time_months') == 3)
        tester.test("PUT settings: max_demand_months", settings.get('max_demand_months') == 6)
        tester.test("PUT settings: non_moving_months", settings.get('non_moving_months') == 12)
    else:
        tester.test("PUT /api/settings returns 200", False)

    # ========================================================================
    # STEP 8: Test GET /api/export/analysis
    # ========================================================================
    print("\n📝 STEP 8: Testing GET /api/export/analysis...")
    resp = tester.api_call("GET", "export/analysis")
    
    if resp and resp.status_code == 200:
        tester.test("GET /api/export/analysis returns 200", True)
        tester.test("export/analysis returns xlsx", 'spreadsheet' in resp.headers.get('Content-Type', ''))
    else:
        tester.test("GET /api/export/analysis returns 200", False)

    # ========================================================================
    # STEP 9: Test criticality normalization
    # ========================================================================
    print("\n📝 STEP 9: Testing criticality normalization...")
    
    # Test invalid criticality (7) -> should normalize to 3
    resp = tester.api_call("PUT", "items/SPECTEST1", json={"criticality": 7})
    if resp and resp.status_code == 200:
        item = resp.json()
        tester.test("Criticality 7 normalized to 3", item.get('criticality') == 3, 3, item.get('criticality'))
    
    # Test creating item without criticality -> should default to 3
    resp = tester.api_call("POST", "items", json={
        "item_code": "SPECTEST2",
        "description": "Test Item 2",
        "uom": "PCS",
        "item_type": "Other",
        "min_qty": 0,
        "max_qty": 0,
        "current_qty": 0,
        "unit_price": 10.0
    })
    if resp and resp.status_code == 200:
        item = resp.json()
        tester.test("Default criticality is 3", item.get('criticality') == 3, 3, item.get('criticality'))

    # ========================================================================
    # STEP 10: Regression tests
    # ========================================================================
    print("\n📝 STEP 10: Running regression tests...")
    
    endpoints = [
        ("GET", "dashboard"),
        ("GET", "reorder"),
        ("GET", "reports/monthly-snapshot"),
        ("GET", "non-moving"),
        ("GET", "export/inventory"),
    ]
    
    for method, endpoint in endpoints:
        resp = tester.api_call(method, endpoint)
        tester.test(f"{method} /api/{endpoint} returns 200", resp and resp.status_code == 200)

    # ========================================================================
    # CLEANUP
    # ========================================================================
    print("\n📝 CLEANUP: Note - Manual MongoDB cleanup required for:")
    print("   - SPECTEST1 transactions (db.transactions.delete_many({item_code:'SPECTEST1'}))")
    print("   - SPECTEST1 item (db.items.delete_one({item_code:'SPECTEST1'}))")
    print("   - SPECTEST2 item (db.items.delete_one({item_code:'SPECTEST2'}))")

    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total tests: {tester.tests_run}")
    print(f"✅ Passed: {tester.tests_passed}")
    print(f"❌ Failed: {tester.tests_failed}")
    
    if tester.tests_failed > 0:
        print("\nFailed tests:")
        for failure in tester.failures:
            print(f"  - {failure}")
    
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"\nSuccess rate: {success_rate:.1f}%")
    
    return 0 if tester.tests_failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
