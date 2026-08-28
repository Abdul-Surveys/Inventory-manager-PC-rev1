import requests
import sys
import json
from io import BytesIO
import pandas as pd

BASE_URL = "https://nifty-matsumoto-10.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []

    def test(self, name, func):
        """Run a single test"""
        self.tests_run += 1
        print(f"\n{'='*60}")
        print(f"TEST {self.tests_run}: {name}")
        print('='*60)
        try:
            func()
            self.tests_passed += 1
            print(f"✅ PASSED: {name}")
            return True
        except AssertionError as e:
            self.tests_failed += 1
            self.failures.append({"test": name, "error": str(e)})
            print(f"❌ FAILED: {name}")
            print(f"   Error: {e}")
            return False
        except Exception as e:
            self.tests_failed += 1
            self.failures.append({"test": name, "error": f"Exception: {str(e)}"})
            print(f"❌ FAILED: {name}")
            print(f"   Exception: {e}")
            return False

    def summary(self):
        """Print test summary"""
        print(f"\n{'='*60}")
        print("TEST SUMMARY")
        print('='*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_failed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failures:
            print(f"\n{'='*60}")
            print("FAILED TESTS:")
            print('='*60)
            for f in self.failures:
                print(f"❌ {f['test']}")
                print(f"   {f['error']}")
        
        return self.tests_failed == 0


def main():
    tester = BackendTester()

    # Test 1: GET /api/items?criticality=1 returns only criticality 1 items
    def test_items_criticality_filter_1():
        resp = requests.get(f"{BASE_URL}/items", params={"criticality": "1", "page_size": 100})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "items" in data, "Response missing 'items' field"
        print(f"   Found {len(data['items'])} items with criticality=1")
        for item in data["items"]:
            assert "criticality" in item, f"Item {item.get('item_code')} missing criticality field"
            assert item["criticality"] == 1, f"Item {item.get('item_code')} has criticality {item['criticality']}, expected 1"
        print(f"   ✓ All items have criticality=1")

    tester.test("GET /api/items?criticality=1 returns only criticality 1 items", test_items_criticality_filter_1)

    # Test 2: GET /api/items?criticality=2 returns only criticality 2 items
    def test_items_criticality_filter_2():
        resp = requests.get(f"{BASE_URL}/items", params={"criticality": "2", "page_size": 100})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "items" in data, "Response missing 'items' field"
        print(f"   Found {len(data['items'])} items with criticality=2")
        for item in data["items"]:
            assert "criticality" in item, f"Item {item.get('item_code')} missing criticality field"
            assert item["criticality"] == 2, f"Item {item.get('item_code')} has criticality {item['criticality']}, expected 2"
        print(f"   ✓ All items have criticality=2")

    tester.test("GET /api/items?criticality=2 returns only criticality 2 items", test_items_criticality_filter_2)

    # Test 3: GET /api/items?criticality=3 returns only criticality 3 items
    def test_items_criticality_filter_3():
        resp = requests.get(f"{BASE_URL}/items", params={"criticality": "3", "page_size": 100})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "items" in data, "Response missing 'items' field"
        print(f"   Found {len(data['items'])} items with criticality=3")
        for item in data["items"]:
            assert "criticality" in item, f"Item {item.get('item_code')} missing criticality field"
            assert item["criticality"] == 3, f"Item {item.get('item_code')} has criticality {item['criticality']}, expected 3"
        print(f"   ✓ All items have criticality=3")

    tester.test("GET /api/items?criticality=3 returns only criticality 3 items", test_items_criticality_filter_3)

    # Test 4: GET /api/items?criticality=all returns all items
    def test_items_criticality_filter_all():
        resp = requests.get(f"{BASE_URL}/items", params={"criticality": "all", "page_size": 100})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "items" in data, "Response missing 'items' field"
        print(f"   Found {data['total']} total items")
        assert data['total'] > 0, "Expected at least some items"
        print(f"   ✓ Returns all items regardless of criticality")

    tester.test("GET /api/items?criticality=all returns all items", test_items_criticality_filter_all)

    # Test 5: GET /api/dashboard returns by_criticality array
    def test_dashboard_by_criticality():
        resp = requests.get(f"{BASE_URL}/dashboard")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "by_criticality" in data, "Response missing 'by_criticality' field"
        by_crit = data["by_criticality"]
        assert isinstance(by_crit, list), "by_criticality should be a list"
        assert len(by_crit) == 3, f"Expected 3 tiers, got {len(by_crit)}"
        
        for tier in by_crit:
            assert "criticality" in tier, "Tier missing 'criticality' field"
            assert "label" in tier, "Tier missing 'label' field"
            assert "count" in tier, "Tier missing 'count' field"
            assert "value" in tier, "Tier missing 'value' field"
            assert "pct" in tier, "Tier missing 'pct' field"
            print(f"   Tier {tier['criticality']}: {tier['label']} - {tier['count']} items, ${tier['value']}, {tier['pct']}%")
        
        print(f"   ✓ by_criticality has 3 tiers with all required fields")

    tester.test("GET /api/dashboard returns by_criticality array with 3 tiers", test_dashboard_by_criticality)

    # Test 6: GET /api/dashboard/critical returns critical materials data
    def test_dashboard_critical():
        resp = requests.get(f"{BASE_URL}/dashboard/critical")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        # Check required fields
        required_fields = ["total_count", "total_value", "reorder_count", "below_min_count", "by_tier", "at_risk"]
        for field in required_fields:
            assert field in data, f"Response missing '{field}' field"
        
        print(f"   Total Count: {data['total_count']}")
        print(f"   Total Value: ${data['total_value']}")
        print(f"   Reorder Count: {data['reorder_count']}")
        print(f"   Below Min Count: {data['below_min_count']}")
        
        # Check by_tier structure
        by_tier = data["by_tier"]
        assert isinstance(by_tier, list), "by_tier should be a list"
        assert len(by_tier) == 2, f"Expected 2 tiers (1 & 2), got {len(by_tier)}"
        
        for tier in by_tier:
            assert "criticality" in tier, "Tier missing 'criticality' field"
            assert tier["criticality"] in [1, 2], f"Expected tier 1 or 2, got {tier['criticality']}"
            assert "label" in tier, "Tier missing 'label' field"
            assert "count" in tier, "Tier missing 'count' field"
            assert "value" in tier, "Tier missing 'value' field"
            assert "below_min" in tier, "Tier missing 'below_min' field"
            assert "minimum" in tier, "Tier missing 'minimum' field"
            assert "ok" in tier, "Tier missing 'ok' field"
            assert "above_max" in tier, "Tier missing 'above_max' field"
            print(f"   Tier {tier['criticality']}: below_min={tier['below_min']}, minimum={tier['minimum']}, ok={tier['ok']}, above_max={tier['above_max']}")
        
        # Check at_risk list
        at_risk = data["at_risk"]
        assert isinstance(at_risk, list), "at_risk should be a list"
        print(f"   At-risk items: {len(at_risk)}")
        
        print(f"   ✓ Critical dashboard has all required fields and structure")

    tester.test("GET /api/dashboard/critical returns complete critical materials data", test_dashboard_critical)

    # Test 7: GET /api/export/inventory returns Excel with new columns
    def test_export_inventory_columns():
        resp = requests.get(f"{BASE_URL}/export/inventory")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert resp.headers.get("Content-Type") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", \
            f"Expected Excel content type, got {resp.headers.get('Content-Type')}"
        
        # Parse Excel
        df = pd.read_excel(BytesIO(resp.content), sheet_name="Inventory", skiprows=4)
        columns = list(df.columns)
        print(f"   Excel columns: {columns}")
        
        assert "Criticality Label" in columns, "Missing 'Criticality Label' column"
        assert "Avg Yearly Consumption" in columns, "Missing 'Avg Yearly Consumption' column"
        
        print(f"   ✓ Excel export contains 'Criticality Label' and 'Avg Yearly Consumption' columns")

    tester.test("GET /api/export/inventory returns Excel with Criticality Label and Avg Yearly Consumption", test_export_inventory_columns)

    # Test 8: GET /api/export/critical returns Excel for critical items
    def test_export_critical():
        resp = requests.get(f"{BASE_URL}/export/critical")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert resp.headers.get("Content-Type") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", \
            f"Expected Excel content type, got {resp.headers.get('Content-Type')}"
        
        # Parse Excel
        df = pd.read_excel(BytesIO(resp.content), sheet_name="Critical Materials", skiprows=4)
        print(f"   Excel has {len(df)} rows")
        
        # Check that all items are criticality 1 or 2
        if len(df) > 0:
            assert "Criticality" in df.columns, "Missing 'Criticality' column"
            for idx, row in df.iterrows():
                crit = row["Criticality"]
                assert crit in [1, 2], f"Row {idx} has criticality {crit}, expected 1 or 2"
            print(f"   ✓ All items are criticality 1 or 2")
        else:
            print(f"   ⚠ No critical items in export (this is OK if dataset has no Tier 1/2 items)")

    tester.test("GET /api/export/critical returns Excel with critical items only", test_export_critical)

    # Test 9: POST /api/items/auto-classify with dry_run=true
    def test_auto_classify_dry_run():
        resp = requests.post(f"{BASE_URL}/items/auto-classify", json={
            "dry_run": True,
            "only_unclassified": True
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        required_fields = ["scanned", "suggested_counts", "changes", "samples", "applied", "dry_run", "only_unclassified"]
        for field in required_fields:
            assert field in data, f"Response missing '{field}' field"
        
        assert data["dry_run"] == True, "dry_run should be True"
        assert data["applied"] == 0, f"dry_run should not apply changes, but applied={data['applied']}"
        
        print(f"   Scanned: {data['scanned']} items")
        print(f"   Suggested counts: {data['suggested_counts']}")
        print(f"   Changes: {data['changes']}")
        print(f"   Samples: {len(data['samples'])}")
        print(f"   Applied: {data['applied']} (should be 0 for dry_run)")
        
        print(f"   ✓ Dry run returns preview without modifying data")

    tester.test("POST /api/items/auto-classify with dry_run=true returns preview", test_auto_classify_dry_run)

    # Test 10: POST /api/items/auto-classify with dry_run=false (apply)
    def test_auto_classify_apply():
        # First get a dry run to see if there are changes
        dry_resp = requests.post(f"{BASE_URL}/items/auto-classify", json={
            "dry_run": True,
            "only_unclassified": True
        })
        dry_data = dry_resp.json()
        
        if dry_data["changes"] == 0:
            print(f"   ⚠ No changes to apply (all items already classified correctly)")
            print(f"   ✓ Test passed (no changes expected)")
            return
        
        # Now apply
        resp = requests.post(f"{BASE_URL}/items/auto-classify", json={
            "dry_run": False,
            "only_unclassified": True
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert data["dry_run"] == False, "dry_run should be False"
        assert data["applied"] > 0, f"Expected some items to be applied, got {data['applied']}"
        
        print(f"   Scanned: {data['scanned']} items")
        print(f"   Changes: {data['changes']}")
        print(f"   Applied: {data['applied']}")
        
        print(f"   ✓ Apply mode successfully modified {data['applied']} items")

    tester.test("POST /api/items/auto-classify with dry_run=false applies changes", test_auto_classify_apply)

    # Test 11: GET /api/analysis includes avg_monthly and avg_yearly consumption
    def test_analysis_consumption_columns():
        resp = requests.get(f"{BASE_URL}/analysis", params={"page_size": 10})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert "rows" in data, "Response missing 'rows' field"
        rows = data["rows"]
        
        if len(rows) > 0:
            for row in rows:
                assert "stats" in row, f"Row for {row.get('item_code')} missing 'stats' field"
                stats = row["stats"]
                assert "avg_monthly_consumption" in stats, f"Stats missing 'avg_monthly_consumption'"
                assert "avg_yearly_consumption" in stats, f"Stats missing 'avg_yearly_consumption'"
                print(f"   {row['item_code']}: avg_monthly={stats['avg_monthly_consumption']}, avg_yearly={stats['avg_yearly_consumption']}")
            
            print(f"   ✓ All {len(rows)} rows have avg_monthly_consumption and avg_yearly_consumption")
        else:
            print(f"   ⚠ No analysis rows (no consumption data yet)")
            print(f"   ✓ Test passed (empty result is valid)")

    tester.test("GET /api/analysis includes avg_monthly and avg_yearly consumption", test_analysis_consumption_columns)

    # Test 12: Verify criticality field is present in items
    def test_items_have_criticality_field():
        resp = requests.get(f"{BASE_URL}/items", params={"page_size": 50})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert "items" in data, "Response missing 'items' field"
        items = data["items"]
        assert len(items) > 0, "Expected at least some items"
        
        for item in items:
            assert "criticality" in item, f"Item {item.get('item_code')} missing 'criticality' field"
            assert item["criticality"] in [1, 2, 3], f"Item {item.get('item_code')} has invalid criticality {item['criticality']}"
        
        print(f"   ✓ All {len(items)} items have valid criticality field (1, 2, or 3)")

    tester.test("Items have criticality field with valid values", test_items_have_criticality_field)

    # Print summary and return exit code
    success = tester.summary()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
