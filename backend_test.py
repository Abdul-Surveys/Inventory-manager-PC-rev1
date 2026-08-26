import requests
import sys
from datetime import datetime

class InventoryAPITester:
    def __init__(self, base_url="https://nifty-matsumoto-10.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None, check_response=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                # Additional response validation if provided
                if check_response:
                    try:
                        resp_data = response.json()
                        check_result = check_response(resp_data)
                        if not check_result:
                            success = False
                            print(f"❌ Failed - Response validation failed")
                            self.failed_tests.append(f"{name}: Response validation failed")
                        else:
                            self.tests_passed += 1
                            print(f"✅ Passed - Status: {response.status_code}")
                    except Exception as e:
                        success = False
                        print(f"❌ Failed - Response check error: {str(e)}")
                        self.failed_tests.append(f"{name}: {str(e)}")
                else:
                    self.tests_passed += 1
                    print(f"✅ Passed - Status: {response.status_code}")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.text[:200]}")
                except Exception:
                    pass
                self.failed_tests.append(f"{name}: Expected {expected_status}, got {response.status_code}")

            return success, response.json() if response.status_code < 500 and response.text else {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append(f"{name}: {str(e)}")
            return False, {}

    def test_items_pagination(self):
        """Test GET /api/items with pagination"""
        success, response = self.run_test(
            "Items Pagination (15000 items)",
            "GET",
            "items",
            200,
            params={"page": 1, "page_size": 50},
            check_response=lambda r: r.get('total', 0) >= 15000 and len(r.get('items', [])) == 50
        )
        return success

    def test_items_search(self):
        """Test GET /api/items with search"""
        success, response = self.run_test(
            "Items Search (search=Jacket 500)",
            "GET",
            "items",
            200,
            params={"search": "Jacket 500", "page_size": 10},
            check_response=lambda r: len(r.get('items', [])) > 0
        )
        return success

    def test_items_filters(self):
        """Test GET /api/items with filters"""
        # Test item_type filter
        success1, _ = self.run_test(
            "Items Filter by Type",
            "GET",
            "items",
            200,
            params={"item_type": "Spare Parts", "page_size": 10}
        )
        
        # Test status filter
        success2, _ = self.run_test(
            "Items Filter by Status",
            "GET",
            "items",
            200,
            params={"status": "OK", "page_size": 10}
        )
        
        return success1 and success2

    def test_items_sorting(self):
        """Test GET /api/items with sorting"""
        success, response = self.run_test(
            "Items Sorting (by total_value desc)",
            "GET",
            "items",
            200,
            params={"sort_by": "total_value", "sort_dir": "desc", "page_size": 10}
        )
        return success

    def test_create_item(self):
        """Test POST /api/items"""
        test_code = f"TEST{datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create New Item",
            "POST",
            "items",
            200,
            data={
                "item_code": test_code,
                "description": "Test Item for API Testing",
                "uom": "PCS",
                "item_type": "Other",
                "min_qty": 10,
                "max_qty": 100,
                "current_qty": 50,
                "unit_price": 25.50
            },
            check_response=lambda r: r.get('item_code') == test_code
        )
        return success, test_code if success else None

    def test_create_duplicate_item(self):
        """Test POST /api/items with duplicate code"""
        success, _ = self.run_test(
            "Create Duplicate Item (should fail with 400)",
            "POST",
            "items",
            400,
            data={
                "item_code": "1001",  # Existing item
                "description": "Duplicate Test",
                "uom": "PCS"
            }
        )
        return success

    def test_get_item(self, item_code="1001"):
        """Test GET /api/items/{code}"""
        success, response = self.run_test(
            f"Get Item {item_code}",
            "GET",
            f"items/{item_code}",
            200,
            check_response=lambda r: r.get('item_code') == item_code
        )
        return success, response

    def test_get_item_not_found(self):
        """Test GET /api/items/{code} with invalid code"""
        success, _ = self.run_test(
            "Get Non-existent Item (should return 404)",
            "GET",
            "items/INVALID999999",
            404
        )
        return success

    def test_transaction_in(self, item_code="1001"):
        """Test POST /api/transactions IN"""
        success, response = self.run_test(
            f"Transaction IN for {item_code}",
            "POST",
            "transactions",
            200,
            data={
                "date": datetime.now().strftime("%Y-%m-%d"),
                "item_code": item_code,
                "direction": "IN",
                "qty": 10,
                "txn_type": "Purchase Order",
                "reference_no": "PO-TEST-001"
            },
            check_response=lambda r: r.get('new_stock') is not None
        )
        return success, response

    def test_transaction_out(self, item_code="1001"):
        """Test POST /api/transactions OUT"""
        success, response = self.run_test(
            f"Transaction OUT for {item_code}",
            "POST",
            "transactions",
            200,
            data={
                "date": datetime.now().strftime("%Y-%m-%d"),
                "item_code": item_code,
                "direction": "OUT",
                "qty": 2,
                "txn_type": "Work Order",
                "reference_no": "WO-TEST-001"
            },
            check_response=lambda r: r.get('new_stock') is not None
        )
        return success, response

    def test_transaction_insufficient_stock(self, item_code="1001"):
        """Test POST /api/transactions OUT with insufficient stock"""
        # First get current stock
        _, item_data = self.test_get_item(item_code)
        current_stock = item_data.get('current_qty', 0)
        
        success, _ = self.run_test(
            f"Transaction OUT exceeding stock (should fail with 400)",
            "POST",
            "transactions",
            400,
            data={
                "date": datetime.now().strftime("%Y-%m-%d"),
                "item_code": item_code,
                "direction": "OUT",
                "qty": current_stock + 1000,  # More than available
                "txn_type": "Work Order"
            }
        )
        return success

    def test_transaction_invalid_item(self):
        """Test POST /api/transactions with invalid item code"""
        success, _ = self.run_test(
            "Transaction with invalid item (should return 404)",
            "POST",
            "transactions",
            404,
            data={
                "date": datetime.now().strftime("%Y-%m-%d"),
                "item_code": "INVALID999999",
                "direction": "IN",
                "qty": 10,
                "txn_type": "Purchase Order"
            }
        )
        return success

    def test_item_analysis(self, item_code="1001"):
        """Test GET /api/items/{code}/analysis"""
        success, response = self.run_test(
            f"Item Analysis for {item_code}",
            "GET",
            f"items/{item_code}/analysis",
            200,
            check_response=lambda r: (
                'item' in r and 
                'recommendation' in r and 
                'total_consumption' in r and
                'avg_monthly_consumption' in r and
                'monthly' in r
            )
        )
        return success, response

    def test_analysis_list(self):
        """Test GET /api/analysis"""
        success, response = self.run_test(
            "Consumption Analysis List",
            "GET",
            "analysis",
            200,
            params={"page": 1, "page_size": 10, "with_consumption_only": True},
            check_response=lambda r: 'rows' in r and 'settings' in r
        )
        return success

    def test_analysis_toggle(self):
        """Test GET /api/analysis with_consumption_only toggle"""
        success, _ = self.run_test(
            "Analysis with_consumption_only=False",
            "GET",
            "analysis",
            200,
            params={"page": 1, "page_size": 10, "with_consumption_only": False}
        )
        return success

    def test_apply_recommendation(self, item_code="1001"):
        """Test POST /api/items/{code}/apply-recommendation"""
        # First get analysis to get recommendation
        _, analysis = self.test_item_analysis(item_code)
        rec = analysis.get('recommendation', {})
        
        if rec.get('recommended_min', 0) > 0:
            success, _ = self.run_test(
                f"Apply Recommendation for {item_code}",
                "POST",
                f"items/{item_code}/apply-recommendation",
                200,
                data={
                    "min_qty": rec['recommended_min'],
                    "max_qty": rec['recommended_max']
                }
            )
            return success
        else:
            print("⚠️  Skipping apply recommendation - no consumption data")
            return True

    def test_get_settings(self):
        """Test GET /api/settings"""
        success, response = self.run_test(
            "Get Settings",
            "GET",
            "settings",
            200,
            check_response=lambda r: (
                'lead_time_months' in r and
                'coverage_months' in r and
                'safety_months' in r and
                'non_moving_months' in r
            )
        )
        return success, response

    def test_update_settings(self):
        """Test PUT /api/settings"""
        # First get current settings
        _, current = self.test_get_settings()
        
        # Update with test values
        success, response = self.run_test(
            "Update Settings",
            "PUT",
            "settings",
            200,
            data={
                "lead_time_months": 8,
                "coverage_months": 7,
                "safety_months": 3,
                "non_moving_months": 12
            },
            check_response=lambda r: r.get('lead_time_months') == 8
        )
        
        # Restore original settings
        if success and current:
            self.run_test(
                "Restore Original Settings",
                "PUT",
                "settings",
                200,
                data={
                    "lead_time_months": current.get('lead_time_months', 6),
                    "coverage_months": current.get('coverage_months', 6),
                    "safety_months": current.get('safety_months', 2),
                    "non_moving_months": current.get('non_moving_months', 12)
                }
            )
        
        return success

    def test_dashboard(self):
        """Test GET /api/dashboard"""
        success, response = self.run_test(
            "Dashboard",
            "GET",
            "dashboard",
            200,
            check_response=lambda r: (
                r.get('total_items', 0) >= 15000 and
                'total_value' in r and
                'by_type' in r and
                'top20' in r and
                'low_stock_items' in r and
                'non_moving_count' in r
            )
        )
        return success

    def test_non_moving(self):
        """Test GET /api/non-moving"""
        success, response = self.run_test(
            "Non-Moving Items",
            "GET",
            "non-moving",
            200,
            params={"page": 1, "page_size": 50},
            check_response=lambda r: 'rows' in r and 'total' in r
        )
        # Note: Expected to be 0 rows since data just imported
        if success:
            print(f"   Non-moving count: {response.get('total', 0)} (0 expected for fresh data)")
        return success

    def test_reverse_transaction(self):
        """Test POST /api/transactions/{id}/reverse"""
        # First create a transaction to reverse
        success, txn_response = self.test_transaction_in("1001")
        if not success:
            return False
        
        txn_id = txn_response.get('transaction', {}).get('id')
        if not txn_id:
            print("❌ Failed - Could not get transaction ID")
            return False
        
        success, _ = self.run_test(
            f"Reverse Transaction {txn_id}",
            "POST",
            f"transactions/{txn_id}/reverse",
            200,
            check_response=lambda r: 'reversal' in r and 'new_stock' in r
        )
        return success

    def test_excel_exports(self):
        """Test all Excel export endpoints"""
        exports = [
            ("Export Inventory", "export/inventory"),
            ("Export Transactions", "export/transactions"),
            ("Export Analysis", "export/analysis"),
            ("Export Non-Moving", "export/non-moving"),
            ("Export Top20", "export/top20")
        ]
        
        all_success = True
        for name, endpoint in exports:
            url = f"{self.base_url}/{endpoint}"
            self.tests_run += 1
            print(f"\n🔍 Testing {name}...")
            try:
                response = requests.get(url, timeout=60)
                if response.status_code == 200:
                    content_type = response.headers.get('Content-Type', '')
                    if 'spreadsheet' in content_type or 'excel' in content_type:
                        if len(response.content) > 0:
                            self.tests_passed += 1
                            print(f"✅ Passed - Excel file received ({len(response.content)} bytes)")
                        else:
                            print(f"❌ Failed - Empty file")
                            self.failed_tests.append(f"{name}: Empty file")
                            all_success = False
                    else:
                        print(f"❌ Failed - Wrong content type: {content_type}")
                        self.failed_tests.append(f"{name}: Wrong content type")
                        all_success = False
                else:
                    print(f"❌ Failed - Status {response.status_code}")
                    self.failed_tests.append(f"{name}: Status {response.status_code}")
                    all_success = False
            except Exception as e:
                print(f"❌ Failed - Error: {str(e)}")
                self.failed_tests.append(f"{name}: {str(e)}")
                all_success = False
        
        return all_success

def main():
    print("=" * 70)
    print("GPP INVENTORY MANAGEMENT SYSTEM - BACKEND API TESTS")
    print("=" * 70)
    
    tester = InventoryAPITester()
    
    # Run all tests
    print("\n📦 ITEMS API TESTS")
    print("-" * 70)
    tester.test_items_pagination()
    tester.test_items_search()
    tester.test_items_filters()
    tester.test_items_sorting()
    item_created, test_item_code = tester.test_create_item()
    tester.test_create_duplicate_item()
    tester.test_get_item("1001")
    tester.test_get_item_not_found()
    
    print("\n💱 TRANSACTIONS API TESTS")
    print("-" * 70)
    tester.test_transaction_in("1001")
    tester.test_transaction_out("1001")
    tester.test_transaction_insufficient_stock("1001")
    tester.test_transaction_invalid_item()
    tester.test_reverse_transaction()
    
    print("\n📊 ANALYSIS API TESTS")
    print("-" * 70)
    tester.test_item_analysis("1001")
    tester.test_analysis_list()
    tester.test_analysis_toggle()
    tester.test_apply_recommendation("1001")
    
    print("\n⚙️  SETTINGS API TESTS")
    print("-" * 70)
    tester.test_get_settings()
    tester.test_update_settings()
    
    print("\n📈 DASHBOARD & REPORTS API TESTS")
    print("-" * 70)
    tester.test_dashboard()
    tester.test_non_moving()
    
    print("\n📥 EXCEL EXPORT API TESTS")
    print("-" * 70)
    tester.test_excel_exports()
    
    # Print summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print(f"✅ Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"❌ Tests failed: {len(tester.failed_tests)}/{tester.tests_run}")
    
    if tester.failed_tests:
        print("\n❌ FAILED TESTS:")
        for failed in tester.failed_tests:
            print(f"   • {failed}")
    
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"\n📊 Success Rate: {success_rate:.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())
