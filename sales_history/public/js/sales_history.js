frappe.ui.form.on('Sales Order', {
    refresh: function(frm) {
        if (frm.doc.docstatus === 0) { 
            initSalesHistoryButtons(frm);
        }
    },
    
});
frappe.ui.form.on('Sales Order Item', {
    items_add: function(frm, cdt, cdn) {
        initSalesHistoryButtons(frm);
    },
    items_remove: function(frm, cdt, cdn) {
        initSalesHistoryButtons(frm);
    }
});

function initSalesHistoryButtons(frm) {
    setTimeout(() => {
        $('.sales-history-info-btn').remove();
        
        frm.fields_dict.items.grid.grid_rows.forEach(row => {
            const rowElement = $(row.wrapper);
            
            const infoBtn = $(`
                <div class="sales-history-info-btn d-inline-flex align-items-center justify-content-center" 
                    data-item-code="${row.doc.item_code || ''}"
                    title="View Sales History"
                    style="position: absolute; left: -18px; top: 50%; transform: translateY(-50%); z-index: 1; font-size: 18px;">
                    <i class="fa fa-info-circle text-info"></i>
                </div>
            `);
            rowElement.css('position', 'relative');
            
            rowElement.append(infoBtn);
            
            infoBtn.on('click', () => {
                if (row.doc.item_code) {
                    showSalesHistory(frm, row);
                } else {
                    frappe.msgprint(__('Please select an item first'));
                }
            });
        });
    }, 300);
}

function showSalesHistory(frm, row) {
    
    frappe.call({
        method: 'sales_history.sales_history.hooks.sales_history.get_item_sales_history',
        args: {
            item_code: row.doc.item_code,
            customer: frm.doc.customer || null,
            limit: 5
        },
        callback: function(response) {
            frappe.hide_progress();
            
            if (!response.message || !response.message.length) {
                frappe.msgprint(__('No sales history found for this item'));
                return;
            }
            
            renderSalesHistoryDialog(frm, row, response.message);
        }
    });
}


function renderSalesHistoryDialog(frm, row, salesHistory) {
    const dialog = new frappe.ui.Dialog({
        title: __('Sales History for {0}', [row.doc.item_code]),
        size: 'large',
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'sales_history_html'
            }
        ]
    });
    
    const currencyFormatter = new Intl.NumberFormat(
        frappe.boot.lang || 'en-US', 
        { style: 'currency', currency: frm.doc.currency }
    );
    
    const tableHtml = `
        <div class="sales-history-table">
            <table class="table table-bordered table-striped table-hover">
                <thead>
                    <tr>
                        <th>${__('Invoice No')}</th>
                        <th>${__('Date')}</th>
                        <th>${__('Customer')}</th>
                        <th class="text-right">${__('Rate')}</th>
                        <th class="text-right">${__('Qty')}</th>
                        <th class="text-right">${__('Amount')}</th>
                        <th class="text-center">${__('Action')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${salesHistory.map(sale => `
                        <tr>
                            <td>
                                <a href="#Form/Sales Invoice/${sale.invoice_no}" target="_blank">
                                    ${sale.invoice_no}
                                </a>
                            </td>
                            <td>${frappe.datetime.str_to_user(sale.posting_date)}</td>
                            <td>${sale.customer_name || sale.customer || ''}</td>
                            <td class="text-right">${currencyFormatter.format(sale.rate)}</td>
                            <td class="text-right">${sale.qty}</td>
                            <td class="text-right">${currencyFormatter.format(sale.amount)}</td>
                            <td class="text-center">
                                <button class="btn btn-xs btn-light use-rate-btn" 
                                        data-rate="${sale.rate}">
                                    ${__('Use')}
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    dialog.fields_dict.sales_history_html.$wrapper.html(tableHtml);
    
    dialog.$wrapper.find('.use-rate-btn').on('click', function() {
        const rate = $(this).data('rate');
        applyHistoricalRate(frm, row, rate);
        dialog.hide();
    });
    
    dialog.show();
}

function applyHistoricalRate(frm, row, rate) {

    frappe.call({
        method: 'sales_history.sales_history.hooks.sales_history.apply_historical_rate',
        args: {
            sales_order: frm.docname,
            item_row: row.doc.name,
            rate: rate
        },
        callback: function(response) {
            if (response.message && response.message.success) {
                frappe.model.set_value(row.doc.doctype, row.doc.name, "rate", rate);
                frappe.model.set_value(row.doc.doctype, row.doc.name, "price_list_rate", rate);
                const qty = row.doc.qty || 1;
                const amount = flt(rate) * flt(qty);
                frappe.model.set_value(row.doctype, row.doc.name, 'amount', amount);
                
                frm.save().then(() => {
                    frappe.show_alert({
                        message: __('Rate updated and saved successfully'),
                        indicator: 'green'
                    }, 3);
                }).catch((err) => {
                    frappe.show_alert({
                        message: __('Rate updated but failed to save: ') + err.message,
                        indicator: 'orange'
                    }, 5);
                });
            } else {
                const errorMsg = response.message ? response.message.message : __('Failed to update rate');
                frappe.msgprint({
                    title: __('Error'),
                    indicator: 'red',
                    message: errorMsg
                });
            }
        }
    });
}

