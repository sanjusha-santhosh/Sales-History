import frappe
from frappe import _
from frappe.utils import flt, cint
import json

@frappe.whitelist()
def get_item_sales_history(item_code, customer=None, limit=5):
    if not item_code:
        return []
    
    limit = cint(limit) or 5
    
    query = f"""
        SELECT 
            sii.parent as invoice_no,
            sii.qty,
            sii.rate,
            sii.amount,
            si.posting_date,
            si.customer_name,
            IFNULL(si.currency, (SELECT value FROM `tabSingles` 
                               WHERE doctype = 'Global Defaults' 
                               AND field = 'default_currency')) as currency
        FROM 
            `tabSales Invoice Item` sii
        JOIN 
            `tabSales Invoice` si ON sii.parent = si.name
        WHERE 
            sii.item_code = %(item_code)s
            AND sii.docstatus = 1
        ORDER BY 
            sii.creation DESC
        LIMIT {limit}
    """
    result = frappe.db.sql(query, {"item_code": item_code}, as_dict=1)
    
    for row in result:
        row["rate"] = flt(row["rate"])
        row["qty"] = flt(row["qty"])
        row["amount"] = flt(row["amount"])
    
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