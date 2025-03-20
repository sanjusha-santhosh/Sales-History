import frappe
from frappe import _
from frappe.utils import flt, cint
import json

@frappe.whitelist()
def get_item_sales_history(item_code, customer=None, limit=5):
    if not item_code:
        return []
    
    limit = cint(limit) or 5
    
    filters = {
        "item_code": item_code,
        "docstatus": 1  
    }
    
    
    sales_items = frappe.get_all(
        "Sales Invoice Item",
        filters=filters,
        fields=[
            "parent as invoice_no",
            "qty",
            "rate",
            "amount",
            "creation"
        ],
        order_by="creation desc",
        limit=limit
    )
    
    if not sales_items:
        return []
    
    invoice_list = list(set([item.invoice_no for item in sales_items]))
    invoice_details = {}
    
    for invoice in frappe.get_all(
        "Sales Invoice",
        filters={"name": ["in", invoice_list]},
        fields=["name", "posting_date", "customer", "customer_name", "currency"]
    ):
        
        invoice_details[invoice.name] = invoice
    
    result = []
    for item in sales_items:
        invoice = invoice_details.get(item.invoice_no, {})
        result.append({
            "invoice_no": item.invoice_no,
            "posting_date": invoice.get("posting_date", ""),
            "customer_name": invoice.get("customer_name", ""),
            "currency": invoice.get("currency", frappe.defaults.get_global_default("currency")),
            "rate": flt(item.rate),
            "qty": flt(item.qty),
            "amount": flt(item.amount)
        })
    
    return result
def get_customer_invoices(customer):
    return frappe.get_all(
        "Sales Invoice",
        filters={
            "customer": customer,
            "docstatus": 1
        },
        pluck="name"
    )

@frappe.whitelist()
def apply_historical_rate(sales_order, item_row, rate):
    try:
        if not sales_order or not item_row or not rate:
            return {"success": False, "message": _("Missing required parameters")}
        
        rate = flt(rate)
        doc = frappe.get_doc("Sales Order", sales_order)
        
        if doc.docstatus != 0:
            return {"success": False, "message": _("Cannot modify submitted document")}
        
        item_found = False
        for item in doc.items:
            if item.name == item_row:
                item.rate = rate
                if hasattr(item, "price_list_rate"):
                    item.price_list_rate = rate
                item_found = True
                break
        
        if not item_found:
            return {"success": False, "message": _("Item row not found")}
        
        doc.calculate_taxes_and_totals()
        return {
            "success": True,
            "message": _("Rate updated successfully"),
            "rate": rate
        }
    
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error applying historical rate")
        return {
            "success": False,
            "message": _("Error: {0}").format(str(e))
        }