import unittest
from step_by_step import query, TOOL
from real_api_agent import OrderStore
class StepTests(unittest.TestCase):
    def setUp(self):self.store=OrderStore()
    def tearDown(self):self.store.db.close()
    def test_correct(self):self.assertEqual(query(self.store,"query_order",'{"order_id":"A100"}')["payment"],"paid")
    def test_bad_json(self):self.assertEqual(query(self.store,"query_order",'{"order_id":"A100"')["error"],"invalid_json")
    def test_bad_type(self):self.assertEqual(query(self.store,"query_order",'{"order_id":100}')["error"],"invalid_arguments")
    def test_bad_tool(self):self.assertEqual(query(self.store,"wrong",'{"order_id":"A100"}')["error"],"unknown_tool")
    def test_unknown_order(self):self.assertEqual(query(self.store,"query_order",'{"order_id":"Z999"}')["status"],"not_found")
    def test_schema(self):self.assertEqual(TOOL["function"]["parameters"]["properties"]["order_id"]["type"],"string")
