let currentUser = null;
let allLeads = [];
let EMPLOYEES = [];
let NOTIFICATIONS = [];
let currentEditingLeadId = null;
let currentEditingEmployeeId = null;

// 🏷️ Sab departments (tagging dropdown ke liye) — Employee form jese hi list
const ALL_DEPARTMENTS = [
    'Admin', 'Ticketing/Flights', 'Finance', 'Cordination', 'Domestic Group',
    'Domestic FIT', 'International Group', 'International FIT', 'Visa',
    'Marketing', 'Customer Support', 'Religious Tours', 'Corporate'
];

// 📌 Lead ke status options
const LEAD_STATUSES = ['New Lead', 'Contacted', 'Quoted', 'Confirmed', 'Complete', 'Cancelled/Refund'];

function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

document.addEventListener("DOMContentLoaded", async () => {
    const token = localStorage.getItem('authToken');
    const currentUserStr = localStorage.getItem('currentUser');

    if (!token || !currentUserStr) {
        alert("Unauthorized access! Please login first.");
        window.location.href = '/login.html';
        return;
    }

    currentUser = JSON.parse(currentUserStr);
    document.getElementById('userNameDisplay').textContent = `${currentUser.name} (${currentUser.department})`;

    const isAdmin = currentUser.department === 'Admin';

    if (isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => {
            const displayValue = (el.tagName === 'TH' || el.tagName === 'TD') ? 'table-cell' : (el.tagName === 'BUTTON' ? 'inline-block' : 'block');
            el.style.setProperty('display', displayValue, 'important');
        });
    }

    await fetchEmployees(token);

    if (isAdmin) {
        renderEmployeesTable();
    }

    injectAnalyticsUI();

    setupSidebarNav();

    loadLeads(token);
    initNotifications(token);

    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });

    document.getElementById('addLeadForm').addEventListener('submit', (e) => {
        e.preventDefault();
        addLead(token);
    });

    document.getElementById('searchName').addEventListener('input', () => {
        applySearchFilter();
    });

    // ⬇ CSV Export buttons
    const exportLeadsBtn = document.getElementById('exportLeadsCsvBtn');
    if (exportLeadsBtn) exportLeadsBtn.addEventListener('click', exportLeadsCSV);

    const exportEmpBtn = document.getElementById('exportEmployeesCsvBtn');
    if (exportEmpBtn) exportEmpBtn.addEventListener('click', exportEmployeesCSV);

    const addEmployeeForm = document.getElementById('addEmployeeForm');
    if (addEmployeeForm) {
        addEmployeeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addEmployee(token);
        });
    }

    const employeesTableBody = document.getElementById('employeesTableBody');
    if (employeesTableBody) {
        employeesTableBody.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.btn-delete-employee');
            if (deleteBtn) {
                deleteEmployee(deleteBtn.getAttribute('data-id'), token);
                return;
            }
            const editBtn = e.target.closest('.btn-edit-employee');
            if (editBtn) {
                openEditEmployeeModal(editBtn.getAttribute('data-id'));
                return;
            }
            const resetBtn = e.target.closest('.btn-reset-password');
            if (resetBtn) {
                resetEmployeePassword(resetBtn.getAttribute('data-id'), token);
            }
        });
    }

    const closeEditEmpModalBtn = document.getElementById('closeEditEmpModalBtn');
    if (closeEditEmpModalBtn) {
        closeEditEmpModalBtn.addEventListener('click', () => {
            document.getElementById('editEmployeeModal').style.display = 'none';
        });
    }
    const saveEditEmpBtn = document.getElementById('saveEditEmpBtn');
    if (saveEditEmpBtn) {
        saveEditEmpBtn.addEventListener('click', () => {
            saveEditedEmployee(token);
        });
    }

    document.getElementById('closeModalBtn').addEventListener('click', () => {
        document.getElementById('leadDetailsModal').style.display = 'none';
    });

    document.getElementById('modalNumPersons').addEventListener('input', (e) => {
        renderModalPassengerInputs(e.target.value);
    });

    document.getElementById('saveModalBtn').addEventListener('click', () => {
        savePassengersFromModal(token);
    });

    // Modal section switching & actions
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'btnOpenTraveller') {
            showModalSection('travellerSection');
        }
        if (e.target && e.target.id === 'btnOpenFollowUp') {
            showModalSection('followUpSection');
        }
        if (e.target && e.target.id === 'btnOpenDocument') {
            showModalSection('documentSection');
        }
        if (e.target && e.target.id === 'btnOpenTag') {
            showModalSection('tagSection');
        }

        if (e.target.classList.contains('btn-add-doc-row')) {
            const docsContainer = document.querySelector('#documentSection .modal-passenger-docs-container');
            if (docsContainer) {
                const noDocsText = docsContainer.querySelector('.no-docs-text');
                if (noDocsText) noDocsText.remove();
                appendDocumentRow(docsContainer);
            }
            return;
        }

        if (e.target.classList.contains('btn-remove-note')) {
            const noteCard = e.target.closest('.followup-note-card');
            if (noteCard) noteCard.remove();
            return;
        }

        if (e.target.classList.contains('btn-remove-doc-row') || e.target.closest('.btn-remove-doc-row')) {
            const btn = e.target.closest('.btn-remove-doc-row');
            const row = btn.closest('.passenger-doc-row');
            const container = row.parentElement;
            row.remove();
            if (container.querySelectorAll('.passenger-doc-row').length === 0) {
                container.innerHTML = '<p class="no-docs-text" style="font-size: 12px; color: #718096; margin: 4px 0;">No documents</p>';
            }
            return;
        }

        // 🔔 Bell icon click -> toggle notifications panel
        const bellBtn = e.target.closest('#notifBellBtn');
        if (bellBtn) {
            toggleNotificationsPanel();
            return;
        }
        // Click outside panel closes it
        const panel = document.getElementById('notificationsPanel');
        if (panel && panel.style.display === 'block' && !e.target.closest('#notificationsPanel') && !e.target.closest('#notifBellBtn')) {
            panel.style.display = 'none';
        }

        const notifItem = e.target.closest('.notif-item');
        if (notifItem) {
            const notifId = notifItem.getAttribute('data-id');
            markNotificationRead(notifId, token);
        }

        if (e.target && e.target.id === 'closeNotifPopupBtn') {
            document.getElementById('notificationPopupModal').style.display = 'none';
            markAllNotificationsRead(token);
        }
    });

    const addNoteBtn = document.getElementById('btnAddFollowUpNote');
    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', () => {
            const textarea = document.getElementById('followUpNoteText');
            const text = textarea.value.trim();
            if (!text) {
                alert("Please write something for the follow-up note.");
                return;
            }
            const timeStr = new Date().toLocaleString();
            appendFollowUpNoteCard(text, timeStr);
            textarea.value = '';
        });
    }

    // 🏷️ Tag section: department change -> populate employee dropdown
    const tagDeptSelect = document.getElementById('tagDepartmentSelect');
    if (tagDeptSelect) {
        tagDeptSelect.addEventListener('change', () => {
            populateTagEmployeeSelect(tagDeptSelect.value);
        });
    }

    const sendTagBtn = document.getElementById('btnSendTag');
    if (sendTagBtn) {
        sendTagBtn.addEventListener('click', () => {
            sendLeadTag(token);
        });
    }

    const leadsTableBody = document.getElementById('leadsTableBody');
    leadsTableBody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-danger');
        if (deleteBtn) {
            deleteLead(deleteBtn.getAttribute('data-id'), token);
            return;
        }

        const viewBtn = e.target.closest('.btn-view-lead');
        if (viewBtn) {
            const leadId = viewBtn.getAttribute('data-id');
            if (leadId) openLeadDetailsModal(leadId);
        }
    });

    leadsTableBody.addEventListener('change', (e) => {
        const assignSelect = e.target.closest('.assign-select');
        if (assignSelect) {
            const leadId = assignSelect.getAttribute('data-id');
            const field = assignSelect.getAttribute('data-field');
            updateAssignment(leadId, field, assignSelect.value, token);
            return;
        }
    });

    // 📌 Detail modal ke andar ke assignment dropdowns aur status dropdown
    document.getElementById('leadDetailsModal').addEventListener('change', (e) => {
        const assignSelect = e.target.closest('.assign-select');
        if (assignSelect) {
            const leadId = assignSelect.getAttribute('data-id');
            const field = assignSelect.getAttribute('data-field');
            updateAssignment(leadId, field, assignSelect.value, token);
            return;
        }
        if (e.target && e.target.id === 'leadStatusSelect') {
            updateLeadStatus(token);
        }
    });

    const saveBasicInfoBtn = document.getElementById('btnSaveBasicInfo');
    if (saveBasicInfoBtn) {
        saveBasicInfoBtn.addEventListener('click', () => saveBasicInfo(token));
    }
});

function showModalSection(sectionId) {
    ['travellerSection', 'followUpSection', 'documentSection', 'tagSection'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === sectionId) ? 'block' : 'none';
    });
}

// ==========================================
// 🧭 SIDEBAR NAVIGATION (Facebook-style left sidebar)
// ==========================================
function setupSidebarNav() {
    const navButtons = document.querySelectorAll('.sidebar-nav-item[data-section]');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const sectionId = btn.getAttribute('data-section');
            ['employeeManagementCard', 'addLeadCard', 'dashboardAnalyticsSection', 'leadsManagementCard'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.setProperty('display', id === sectionId ? 'block' : 'none', 'important');
            });
        });
    });

    // Default section jo pehle khule
    const defaultBtn = document.querySelector('.sidebar-nav-item[data-section="leadsManagementCard"]');
    if (defaultBtn) defaultBtn.click();

    // Sidebar search box -> lead/employee search se link
    const sidebarSearch = document.getElementById('sidebarSearchInput');
    if (sidebarSearch) {
        sidebarSearch.addEventListener('input', () => {
            const query = sidebarSearch.value.trim();
            // Leads section khol do aur search chala do
            const leadsBtn = document.querySelector('.sidebar-nav-item[data-section="leadsManagementCard"]');
            if (leadsBtn && query) leadsBtn.click();
            document.getElementById('searchName').value = query;
            applySearchFilter();
        });
    }
}

function injectAnalyticsUI() {
    if (document.getElementById('dashboardAnalyticsSection')) return;
    const isAdmin = currentUser.department === 'Admin';

    const analyticsDiv = document.createElement('div');
    analyticsDiv.id = 'dashboardAnalyticsSection';
    analyticsDiv.className = 'card';
    analyticsDiv.style.cssText = 'margin-top: 15px; display: none;';

    analyticsDiv.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 15px; color: #2d3748; font-size: 18px;">📊 Dashboard Analytics & Workload Summary</h3>

        <div style="font-size: 13px; font-weight: bold; color: #4a5568; margin-bottom: 8px;">🏢 Overall Company Leads</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 20px;">
            <div style="background: #edf2f7; padding: 15px; border-radius: 6px; border-left: 4px solid #3182ce;">
                <div style="font-size: 12px; color: #4a5568; font-weight: bold; text-transform: uppercase;">Total Leads</div>
                <div id="statTotalLeads" style="font-size: 24px; font-weight: bold; color: #2d3748; margin-top: 5px;">0</div>
            </div>
        </div>

        <div id="personalStatsWrapper" style="display: ${isAdmin ? 'none' : 'block'}; margin-top: 20px; border-top: 2px dashed #cbd5e0; padding-top: 15px;">
            <div style="font-size: 13px; font-weight: bold; color: #2b6cb0; margin-bottom: 8px;">👤 My Personal Performance (<span id="myNameDisplay">${escapeHTML(currentUser.name || currentUser.email)}</span>)</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px;">
                <div style="background: #ebf8ff; padding: 15px; border-radius: 6px; border-left: 4px solid #3182ce;">
                    <div style="font-size: 12px; color: #2b6cb0; font-weight: bold; text-transform: uppercase;">My Total Assigned</div>
                    <div id="statMyTotal" style="font-size: 24px; font-weight: bold; color: #2b6cb0; margin-top: 5px;">0</div>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-top: 15px;">
            <div style="background: #f7fafc; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e0;">
                <strong style="font-size: 13px; color: #2d3748;">Visa Department Workload</strong>
                <div id="workloadVisa" style="font-size: 13px; color: #4a5568; margin-top: 5px;">Assigned: 0</div>
            </div>
            <div style="background: #f7fafc; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e0;">
                <strong style="font-size: 13px; color: #2d3748;">Ticketing Dept Workload</strong>
                <div id="workloadTicketing" style="font-size: 13px; color: #4a5568; margin-top: 5px;">Assigned: 0</div>
            </div>
            <div style="background: #f7fafc; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e0;">
                <strong style="font-size: 13px; color: #2d3748;">Finance Dept Workload</strong>
                <div id="workloadFinance" style="font-size: 13px; color: #4a5568; margin-top: 5px;">Assigned: 0</div>
            </div>
            <div style="background: #f7fafc; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e0;">
                <strong style="font-size: 13px; color: #2d3748;">Tour Dept Workload</strong>
                <div id="workloadTour" style="font-size: 13px; color: #4a5568; margin-top: 5px;">Assigned: 0</div>
            </div>
        </div>
    `;

    const addLeadCard = document.getElementById('addLeadCard');
    if (addLeadCard) {
        addLeadCard.insertAdjacentElement('afterend', analyticsDiv);
    } else {
        document.body.insertBefore(analyticsDiv, document.body.firstChild);
    }
}

function updateAnalyticsStats(leads) {
    const total = leads.length;
    let visaAssigned = 0, ticketingAssigned = 0, financeAssigned = 0, tourAssigned = 0;
    let myTotal = 0;
    const myEmail = currentUser.email;
    const isAdmin = currentUser.department === 'Admin';

    leads.forEach(lead => {
        if (lead.assignedVisa) visaAssigned++;
        if (lead.assignedTicketing) ticketingAssigned++;
        if (lead.assignedFinance) financeAssigned++;
        if (lead.assignedTour) tourAssigned++;

        const isAssignedToMe = !isAdmin && (
            lead.assignedVisa === myEmail ||
            lead.assignedTicketing === myEmail ||
            lead.assignedFinance === myEmail ||
            lead.assignedTour === myEmail
        );

        if (isAssignedToMe) {
            myTotal++;
        }
    });

    if (document.getElementById('statTotalLeads')) document.getElementById('statTotalLeads').textContent = total;

    if (document.getElementById('workloadVisa')) document.getElementById('workloadVisa').textContent = `Assigned Leads: ${visaAssigned}`;
    if (document.getElementById('workloadTicketing')) document.getElementById('workloadTicketing').textContent = `Assigned Leads: ${ticketingAssigned}`;
    if (document.getElementById('workloadFinance')) document.getElementById('workloadFinance').textContent = `Assigned Leads: ${financeAssigned}`;
    if (document.getElementById('workloadTour')) document.getElementById('workloadTour').textContent = `Assigned Leads: ${tourAssigned}`;

    if (!isAdmin) {
        if (document.getElementById('statMyTotal')) document.getElementById('statMyTotal').textContent = myTotal;
    }
}

async function fetchEmployees(token) {
    try {
        const res = await fetch('/api/employees', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            EMPLOYEES = await res.json();
        }
    } catch (err) {
        console.error("Error fetching employees:", err);
    }
}

function renderEmployeesTable() {
    const tbody = document.getElementById('employeesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    EMPLOYEES.forEach(emp => {
        const tr = document.createElement('tr');
        const statusBadge = emp.activated
            ? '<span class="badge-activated">Activated</span>'
            : '<span class="badge-pending">Pending Activation</span>';

        tr.innerHTML = `
            <td><strong>${escapeHTML(emp.employeeId)}</strong></td>
            <td>${escapeHTML(emp.name)}</td>
            <td>${escapeHTML(emp.phone || '-')}</td>
            <td>${escapeHTML(emp.email || '-')}</td>
            <td>${escapeHTML(emp.department)}</td>
            <td>${statusBadge}</td>
            <td>
                <button type="button" class="btn-edit btn-edit-employee" data-id="${escapeHTML(emp.id)}">Edit</button>
                <button type="button" class="btn-reset btn-reset-password" data-id="${escapeHTML(emp.id)}">Reset Password</button>
                <button type="button" class="btn-danger btn-delete-employee" data-id="${escapeHTML(emp.id)}">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function addEmployee(token) {
    const msgBox = document.getElementById('empMsg');
    const successBox = document.getElementById('empSuccessMsg');
    msgBox.style.display = 'none';
    successBox.style.display = 'none';

    const name = document.getElementById('empName').value;
    const phone = document.getElementById('empPhone').value;
    const email = document.getElementById('empEmail').value;
    const department = document.getElementById('empDepartment').value;

    try {
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, phone, email, department })
        });

        const data = await res.json();
        if (!res.ok) {
            msgBox.innerText = data.error || 'Failed to add employee';
            msgBox.style.display = 'block';
            return;
        }

        document.getElementById('addEmployeeForm').reset();
        successBox.innerText = `Employee added!`;
        successBox.style.display = 'block';

        await fetchEmployees(token);
        renderEmployeesTable();
        applySearchFilter();
    } catch (err) {
        console.error("Add employee error:", err);
        msgBox.innerText = 'Server error while adding employee.';
        msgBox.style.display = 'block';
    }
}

function openEditEmployeeModal(id) {
    const emp = EMPLOYEES.find(e => String(e.id) === String(id));
    if (!emp) return;

    currentEditingEmployeeId = id;
    document.getElementById('editEmpName').value = emp.name;
    document.getElementById('editEmpPhone').value = emp.phone || '';
    document.getElementById('editEmpEmail').value = emp.email || '';
    document.getElementById('editEmpDepartment').value = emp.department;
    document.getElementById('editEmpMsg').style.display = 'none';
    document.getElementById('editEmployeeModal').style.display = 'flex';
}

async function saveEditedEmployee(token) {
    if (!currentEditingEmployeeId) return;

    const msgBox = document.getElementById('editEmpMsg');
    msgBox.style.display = 'none';

    const name = document.getElementById('editEmpName').value;
    const phone = document.getElementById('editEmpPhone').value;
    const email = document.getElementById('editEmpEmail').value;
    const department = document.getElementById('editEmpDepartment').value;

    try {
        const res = await fetch(`/api/admin/users/${currentEditingEmployeeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, phone, email, department })
        });

        const data = await res.json();
        if (!res.ok) {
            msgBox.innerText = data.error || 'Failed to update employee';
            msgBox.style.display = 'block';
            return;
        }

        document.getElementById('editEmployeeModal').style.display = 'none';
        await fetchEmployees(token);
        renderEmployeesTable();
        applySearchFilter();
    } catch (err) {
        console.error("Edit employee error:", err);
        msgBox.innerText = 'Server error while updating employee.';
        msgBox.style.display = 'block';
    }
}

async function deleteEmployee(id, token) {
    if (!confirm("Are you sure you want to remove this employee?")) return;

    try {
        const res = await fetch(`/api/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            await fetchEmployees(token);
            renderEmployeesTable();
            applySearchFilter();
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to delete employee');
        }
    } catch (err) {
        console.error("Delete employee error:", err);
    }
}

async function resetEmployeePassword(id, token) {
    if (!confirm("Are you sure you want to reset the password.")) return;

    try {
        const res = await fetch(`/api/admin/users/${id}/reset-password`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (res.ok) {
            alert(data.message);
            await fetchEmployees(token);
            renderEmployeesTable();
        } else {
            alert(data.error || 'Failed to reset password');
        }
    } catch (err) {
        console.error("Reset password error:", err);
        alert('Server error while resetting password.');
    }
}

function appendDocumentRow(container, docName = '', docUrl = '') {
    const row = document.createElement('div');
    row.className = 'passenger-doc-row';
    row.dataset.existingUrl = docUrl || '';
    row.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-bottom: 6px; align-items: center;';

    row.innerHTML = `
        <input type="text" class="pass-doc-name" value="${escapeHTML(docName)}" placeholder="Doc Name (e.g. Passport)" style="width: 100%; padding: 5px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 12px;">
        <div>
            <input type="file" class="pass-doc-file" accept="image/*,.pdf,.doc,.docx" style="width: 100%; font-size: 11px;">
            ${docUrl ? `<small style="display:block; font-size:10px; margin-top:2px;"><a href="${escapeHTML(docUrl)}" target="_blank" style="color: #3182ce; font-weight: bold; text-decoration: underline;">🔍 View Document</a></small>` : ''}
        </div>
        <button type="button" class="btn-remove-doc-row" title="Remove this document" style="background: #e53e3e; color: white; border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0;">✕</button>
    `;
    container.appendChild(row);
}

function appendFollowUpNoteCard(text, timeStr) {
    const container = document.getElementById('followUpNotesList');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'followup-note-card';
    card.style.cssText = 'background: #fffaf0; border: 1px solid #feebc8; border-left: 4px solid #d69e2e; padding: 10px; border-radius: 6px; margin-bottom: 8px; position: relative;';

    card.innerHTML = `
        <div style="font-size: 11px; color: #718096; margin-bottom: 4px;">🕒 ${escapeHTML(timeStr)}</div>
        <div style="font-size: 13px; color: #2d3748; white-space: pre-wrap; word-break: break-word;">${escapeHTML(text)}</div>
        <button type="button" class="btn-remove-note" style="position: absolute; top: 8px; right: 8px; background: #e53e3e; color: white; border: none; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center; padding: 0;" title="Delete Note">✕</button>
    `;
    container.appendChild(card);
}

async function loadLeads(token) {
    try {
        const response = await fetch('/api/leads', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401 || response.status === 403) {
            alert("Session expired. Please login again.");
            localStorage.clear();
            window.location.href = '/login.html';
            return;
        }

        allLeads = await response.json();
        updateAnalyticsStats(allLeads);
        applySearchFilter();
    } catch (err) {
        console.error("Failed to fetch leads:", err);
    }
}

function applySearchFilter() {
    const query = document.getElementById('searchName').value.trim().toLowerCase();
    if (!query) {
        renderLeads(allLeads, '');
        return;
    }
    const filtered = allLeads.filter(lead => (lead.name || '').toLowerCase().includes(query));
    renderLeads(filtered, query);
}

const FIELD_DEPARTMENTS = {
    assignedVisa: ['Visa'],
    assignedTicketing: ['Ticketing/Flights'],
    assignedFinance: ['Finance'],
    assignedTour: ['Domestic Group', 'International Group', 'International FIT', 'Religious Tours', 'Domestic FIT']
};

function normalizeDept(str) {
    return (str || '')
        .trim()
        .toLowerCase()
        .replace(/\s*department\s*$/i, '');
}

function buildAssignCell(lead, fieldKey) {
    const currentValue = lead[fieldKey] || '';
    const targetDepts = FIELD_DEPARTMENTS[fieldKey] || [];
    const targetDeptsNormalized = targetDepts.map(normalizeDept);

    const relevantEmployees = EMPLOYEES.filter(emp => targetDeptsNormalized.includes(normalizeDept(emp.department)));

    let options = `<option value="">-- Unassigned --</option>`;
    relevantEmployees.forEach(emp => {
        const selected = emp.email === currentValue ? 'selected' : '';
        options += `<option value="${escapeHTML(emp.email)}" ${selected}>${escapeHTML(emp.name)}</option>`;
    });

    return `<select class="assign-select" data-id="${escapeHTML(lead.id)}" data-field="${fieldKey}">${options}</select>`;
}

function buildSourceCell(lead) {
    return `<span>${escapeHTML(lead.source || 'Direct')}</span>`;
}

function renderLeads(leads, searchQuery = '') {
    const tbody = document.getElementById('leadsTableBody');
    tbody.innerHTML = '';

    if (leads.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #718096; font-weight: 600;">No results found</td></tr>`;
        return;
    }

    const isAdmin = currentUser.department === 'Admin';

    leads.forEach(lead => {
        const tr = document.createElement('tr');
        const nameMatched = searchQuery && (lead.name || '').toLowerCase().includes(searchQuery);
        const nameCellStyle = nameMatched ? 'background-color: #c6f6d5; font-weight: 600; color: #22543d;' : '';

        // 🏷️ Current tag / handover cell
        const tagCell = lead.currentTagName
            ? `<div style="font-size: 12px;"><strong>${escapeHTML(lead.currentTagName)}</strong><br><span style="color:#718096;">${escapeHTML(lead.currentTagDepartment || '')}</span></div>`
            : `<span style="color:#a0aec0; font-size: 12px;">Not tagged</span>`;

        tr.innerHTML = `
            <td style="${nameCellStyle}">${escapeHTML(lead.name)}</td>
            <td>${escapeHTML(lead.phone)}</td>
            <td>${escapeHTML(lead.destination)}</td>
            <td>${buildAssignCell(lead, 'assignedTour')}</td>
            <td>${tagCell}</td>
            <td style="white-space: nowrap;">
                <button type="button" class="btn-view-lead" data-id="${escapeHTML(lead.id)}" title="View / Edit Details" style="background:#3182ce; color:white; border:none; width:34px; height:34px; border-radius:6px; cursor:pointer; font-size:16px;">👁️</button>
                ${isAdmin ? `<button class="btn-danger" data-id="${escapeHTML(lead.id)}" style="margin-left:6px;">Delete</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 🏷️ TAGGING / HANDOVER UI
// ==========================================
function populateTagEmployeeSelect(department) {
    const empSelect = document.getElementById('tagEmployeeSelect');
    if (!empSelect) return;
    empSelect.innerHTML = '<option value="">-- Select Employee --</option>';

    if (!department) return;
    const relevant = EMPLOYEES.filter(e => normalizeDept(e.department) === normalizeDept(department) && e.email);
    relevant.forEach(emp => {
        empSelect.innerHTML += `<option value="${escapeHTML(emp.email)}">${escapeHTML(emp.name)}</option>`;
    });
    if (relevant.length === 0) {
        empSelect.innerHTML += `<option value="" disabled>No employees with email in this department</option>`;
    }
}

function renderTagHistory(tagHistory) {
    const container = document.getElementById('tagHistoryList');
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(tagHistory) || tagHistory.length === 0) {
        container.innerHTML = '<p style="font-size: 12px; color: #718096;">Koi tagging history nahi hai abhi.</p>';
        return;
    }

    tagHistory.forEach(entry => {
        const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
        const card = document.createElement('div');
        card.style.cssText = 'background: #ebf8ff; border-left: 4px solid #3182ce; padding: 8px 10px; border-radius: 6px; margin-bottom: 6px; font-size: 12px;';
        card.innerHTML = `
            <div style="color:#718096; margin-bottom:2px;">🕒 ${escapeHTML(timeStr)}</div>
            <div><strong>${escapeHTML(entry.fromName || '')}</strong> ➜ <strong>${escapeHTML(entry.toName || '')}</strong> <span style="color:#2b6cb0;">(${escapeHTML(entry.department || '')})</span></div>
            ${entry.note ? `<div style="margin-top:2px; color:#4a5568;">${escapeHTML(entry.note)}</div>` : ''}
        `;
        container.appendChild(card);
    });
}

async function sendLeadTag(token) {
    if (!currentEditingLeadId) return;

    const department = document.getElementById('tagDepartmentSelect').value;
    const toEmail = document.getElementById('tagEmployeeSelect').value;
    const note = document.getElementById('tagNoteText').value.trim();
    const msgBox = document.getElementById('tagMsg');
    msgBox.style.display = 'none';

    if (!department || !toEmail) {
        msgBox.innerText = 'Department aur Employee dono select karna zaroori hai.';
        msgBox.style.display = 'block';
        return;
    }

    try {
        const res = await fetch(`/api/leads/${currentEditingLeadId}/tag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ toEmail, department, note })
        });
        const data = await res.json();
        if (!res.ok) {
            msgBox.innerText = data.error || 'Tag karne mein masla aaya.';
            msgBox.style.display = 'block';
            return;
        }

        document.getElementById('tagNoteText').value = '';
        renderTagHistory(data.tagHistory);
        await loadLeads(token);
    } catch (err) {
        console.error("Tag lead error:", err);
        msgBox.innerText = 'Server error while tagging lead.';
        msgBox.style.display = 'block';
    }
}

function openLeadDetailsModal(leadId) {
    let lead = allLeads.find(l => String(l.id) === String(leadId));
    if (!lead) lead = { id: leadId, passengers: [], followUpNotes: [], documents: [], tagHistory: [] };

    currentEditingLeadId = leadId;
    const currentCount = lead.numberOfPersons || (lead.passengers ? lead.passengers.length : 1);

    // 📌 Top info panel (readonly + editable)
    document.getElementById('detailDateAdded').textContent = lead.createdAt ? new Date(lead.createdAt).toLocaleString() : '—';
    document.getElementById('detailAddedBy').textContent = lead.addedByName ? `${lead.addedByName}` : '—';
    document.getElementById('detailName').value = lead.name || '';
    document.getElementById('detailPhone').value = lead.phone || '';
    document.getElementById('detailEmail').value = lead.email || '';
    document.getElementById('detailSource').value = lead.source || '';
    document.getElementById('detailDestination').value = lead.destination || '';
    document.getElementById('detailTravelDate').value = lead.travelDate || '';
    document.getElementById('detailDuration').value = lead.duration || '';
    document.getElementById('detailNumPersons').value = lead.numberOfPersons || 1;
    document.getElementById('basicInfoMsg').style.display = 'none';

    // 📌 Status dropdown
    const statusSelect = document.getElementById('leadStatusSelect');
    if (statusSelect) statusSelect.value = lead.leadStatus || 'New Lead';

    // 📌 4 Assignments — reuse buildAssignCell but with a modal-specific wrapper class
    const assignWrap = document.getElementById('detailAssignmentsGrid');
    if (assignWrap) {
        assignWrap.innerHTML = `
            <div><label style="font-size:12px;">Visa Assigned</label>${buildAssignCell(lead, 'assignedVisa')}</div>
            <div><label style="font-size:12px;">Ticketing Assigned</label>${buildAssignCell(lead, 'assignedTicketing')}</div>
            <div><label style="font-size:12px;">Finance Assigned</label>${buildAssignCell(lead, 'assignedFinance')}</div>
            <div><label style="font-size:12px;">Tour Assigned</label>${buildAssignCell(lead, 'assignedTour')}</div>
        `;
    }

    showModalSection(null); // sab sections hide kar do, user button click kare

    document.getElementById('modalNumPersons').value = currentCount;
    renderModalPassengerInputs(currentCount, lead.passengers || []);

    const notesContainer = document.getElementById('followUpNotesList');
    if (notesContainer) {
        notesContainer.innerHTML = '';
        const notesArray = Array.isArray(lead.followUpNotes) ? lead.followUpNotes : [];
        notesArray.forEach(note => {
            appendFollowUpNoteCard(note.text, note.time || 'Saved Note');
        });
    }

    const docContainer = document.querySelector('#documentSection .modal-passenger-docs-container');
    if (docContainer) {
        docContainer.innerHTML = '';
        const docs = Array.isArray(lead.documents) ? lead.documents : [];
        if (docs.length > 0) {
            docs.forEach(d => appendDocumentRow(docContainer, d.name, d.url));
        } else {
            docContainer.innerHTML = '<p class="no-docs-text" style="font-size: 12px; color: #718096; margin: 4px 0;">No documents</p>';
        }
    }

    // 🏷️ Tag section reset
    const tagDeptSelect = document.getElementById('tagDepartmentSelect');
    if (tagDeptSelect) tagDeptSelect.value = '';
    populateTagEmployeeSelect('');
    document.getElementById('tagNoteText').value = '';
    document.getElementById('tagMsg').style.display = 'none';
    renderTagHistory(lead.tagHistory || []);

    document.getElementById('leadDetailsModal').style.display = 'flex';
}

// 📌 Basic Info Save (Name, Phone, Email, Source, Destination, Travel Date, Duration, No. of persons)
async function saveBasicInfo(token) {
    if (!currentEditingLeadId) return;
    const msgBox = document.getElementById('basicInfoMsg');
    msgBox.style.display = 'none';

    const payload = {
        name: document.getElementById('detailName').value.trim(),
        phone: document.getElementById('detailPhone').value.trim(),
        email: document.getElementById('detailEmail').value.trim(),
        source: document.getElementById('detailSource').value.trim(),
        destination: document.getElementById('detailDestination').value.trim(),
        travelDate: document.getElementById('detailTravelDate').value.trim(),
        duration: document.getElementById('detailDuration').value.trim(),
        numberOfPersons: document.getElementById('detailNumPersons').value
    };

    try {
        const res = await fetch(`/api/leads/${currentEditingLeadId}/basic-info`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            msgBox.innerText = data.error || 'Failed to save info';
            msgBox.style.display = 'block';
            return;
        }
        await loadLeads(token);
        msgBox.style.color = '#22543d';
        msgBox.innerText = '✅ Saved!';
        msgBox.style.display = 'block';
        setTimeout(() => { msgBox.style.display = 'none'; }, 2000);
    } catch (err) {
        console.error("Save basic info error:", err);
        msgBox.innerText = 'Server error while saving.';
        msgBox.style.display = 'block';
    }
}

// 📌 Status update
async function updateLeadStatus(token) {
    if (!currentEditingLeadId) return;
    const status = document.getElementById('leadStatusSelect').value;

    try {
        const res = await fetch(`/api/leads/${currentEditingLeadId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Failed to update status');
            return;
        }
        await loadLeads(token);
    } catch (err) {
        console.error("Status update error:", err);
    }
}

function renderModalPassengerInputs(count, existingPassengers = []) {
    const container = document.getElementById('modalPassengersContainer');
    container.innerHTML = '';

    for (let i = 0; i < (parseInt(count) || 1); i++) {
        const p = existingPassengers[i] || {};
        const passengerBox = document.createElement('div');
        passengerBox.className = 'modal-passenger-box';
        passengerBox.style.cssText = 'background: #f7fafc; padding: 12px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #e2e8f0;';

        passengerBox.innerHTML = `
            <strong>Passenger ${i + 1}</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">
                <div><label style="font-size: 12px;">Name</label><input type="text" class="modal-pass-name" value="${escapeHTML(p.name || '')}" style="width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px;"></div>
                <div><label style="font-size: 12px;">CNIC</label><input type="text" class="modal-pass-cnic" value="${escapeHTML(p.cnic || '')}" style="width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px;"></div>
                <div><label style="font-size: 12px;">Passport Number</label><input type="text" class="modal-pass-passport" value="${escapeHTML(p.passport || '')}" style="width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px;"></div>
                <div><label style="font-size: 12px;">Phone Number</label><input type="text" class="modal-pass-phone" value="${escapeHTML(p.phone || '')}" style="width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px;"></div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 12px;">Age Category</label>
                    <select class="modal-pass-age" style="width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px; background: #fff;">
                        <option value="" ${!p.ageCategory ? 'selected' : ''}>-- Select Age Category --</option>
                        <option value="Adult" ${p.ageCategory === 'Adult' ? 'selected' : ''}>Adult</option>
                        <option value="Child with bed" ${p.ageCategory === 'Child with bed' ? 'selected' : ''}>Child with bed</option>
                        <option value="Child without bed" ${p.ageCategory === 'Child without bed' ? 'selected' : ''}>Child without bed</option>
                        <option value="Infant" ${p.ageCategory === 'Infant' ? 'selected' : ''}>Infant</option>
                    </select>
                </div>
            </div>
        `;
        container.appendChild(passengerBox);
    }
}

async function savePassengersFromModal(token) {
    if (!currentEditingLeadId) return;

    const count = parseInt(document.getElementById('modalNumPersons').value) || 1;
    const boxes = document.querySelectorAll('.modal-passenger-box');
    const formData = new FormData();
    formData.append('numberOfPersons', count);

    let followUpNotes = [];
    document.querySelectorAll('.followup-note-card').forEach(card => {
        const timeDivText = card.querySelector('div:nth-child(1)').textContent;
        const timeStr = timeDivText.replace('🕒 ', '').trim();
        const textDiv = card.querySelector('div:nth-child(2)').textContent;
        followUpNotes.push({ time: timeStr, text: textDiv });
    });
    formData.append('followUpNotes', JSON.stringify(followUpNotes));

    let passengersMeta = [];
    boxes.forEach((box) => {
        passengersMeta.push({
            name: box.querySelector('.modal-pass-name').value.trim(),
            cnic: box.querySelector('.modal-pass-cnic').value.trim(),
            passport: box.querySelector('.modal-pass-passport').value.trim(),
            phone: box.querySelector('.modal-pass-phone').value.trim(),
            ageCategory: box.querySelector('.modal-pass-age') ? box.querySelector('.modal-pass-age').value : ''
        });
    });
    formData.append('passengers', JSON.stringify(passengersMeta));

    const docRows = document.querySelectorAll('#documentSection .passenger-doc-row');
    let documentsMeta = [];
    docRows.forEach((row, docIndex) => {
        const docName = row.querySelector('.pass-doc-name').value.trim();
        const fileInput = row.querySelector('.pass-doc-file');
        const existingUrl = row.dataset.existingUrl || '';
        let hasFile = false;
        if (fileInput && fileInput.files[0]) {
            hasFile = true;
            formData.append(`leadDoc_${docIndex}`, fileInput.files[0]);
        }
        documentsMeta.push({ name: docName, url: existingUrl, hasFile: hasFile });
    });
    formData.append('documents', JSON.stringify(documentsMeta));

    try {
        const res = await fetch(`/api/leads/${currentEditingLeadId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Failed to update details');
        } else {
            document.getElementById('leadDetailsModal').style.display = 'none';
            loadLeads(token);
        }
    } catch (err) {
        console.error("Update error:", err);
    }
}

async function addLead(token) {
    const msgBox = document.getElementById('addLeadMsg');
    msgBox.style.display = 'none';

    const numberOfPersons = parseInt(document.getElementById('numberOfPersons').value) || 1;
    const formData = new FormData();
    formData.append('name', document.getElementById('newLeadName').value);
    formData.append('email', document.getElementById('newLeadEmail').value);
    formData.append('phone', document.getElementById('newLeadPhone').value);
    formData.append('destination', document.getElementById('newLeadDestination').value);
    formData.append('source', document.getElementById('newLeadSource').value);
    formData.append('travelDate', document.getElementById('newLeadTravelDate').value);
    formData.append('duration', document.getElementById('newLeadDuration').value);
    formData.append('numberOfPersons', numberOfPersons);
    formData.append('passengers', JSON.stringify([]));

    try {
        const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const data = await res.json();
        if (!res.ok) {
            msgBox.innerText = data.error || 'Failed to add lead';
            msgBox.style.display = 'block';
            return;
        }

        document.getElementById('addLeadForm').reset();
        document.getElementById('numberOfPersons').value = 1;
        loadLeads(token);
    } catch (err) {
        console.error("Add lead error:", err);
        msgBox.innerText = 'Server error while adding lead.';
        msgBox.style.display = 'block';
    }
}

async function updateAssignment(leadId, field, value, token) {
    try {
        const res = await fetch(`/api/leads/${leadId}/assign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ field, value })
        });

        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Failed to update assignment');
        }
        loadLeads(token);
    } catch (err) {
        console.error("Assignment update error:", err);
        loadLeads(token);
    }
}

async function deleteLead(id, token) {
    if (!confirm("Are you sure you want to delete this lead?")) return;

    try {
        const response = await fetch(`/api/leads/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();
        if (response.ok) {
            loadLeads(token);
        } else {
            alert(result.error || "Failed to delete lead");
        }
    } catch (err) {
        console.error("Delete error:", err);
    }
}

// ==========================================
// ⬇ CSV EXPORT
// ==========================================
function csvEscape(val) {
    if (val === null || val === undefined) val = '';
    val = String(val).replace(/"/g, '""');
    if (/[",\n]/.test(val)) val = `"${val}"`;
    return val;
}

function convertToCSV(rows, headers) {
    const headerRow = headers.map(h => csvEscape(h.label)).join(',');
    const dataRows = rows.map(row => headers.map(h => csvEscape(h.value(row))).join(','));
    return [headerRow, ...dataRows].join('\n');
}

function downloadCSV(filename, csvContent) {
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function exportLeadsCSV() {
    const headers = [
        { label: 'Name', value: l => l.name },
        { label: 'Email', value: l => l.email },
        { label: 'Phone', value: l => l.phone },
        { label: 'Destination', value: l => l.destination },
        { label: 'Source', value: l => l.source },
        { label: 'Persons', value: l => l.numberOfPersons },
        { label: 'Visa Assigned', value: l => l.assignedVisa || '' },
        { label: 'Ticketing Assigned', value: l => l.assignedTicketing || '' },
        { label: 'Finance Assigned', value: l => l.assignedFinance || '' },
        { label: 'Tour Assigned', value: l => l.assignedTour || '' },
        { label: 'Current Tag Department', value: l => l.currentTagDepartment || '' },
        { label: 'Currently Tagged To', value: l => l.currentTagName || '' }
    ];
    const csv = convertToCSV(allLeads, headers);
    downloadCSV(`leads_export_${Date.now()}.csv`, csv);
}

function exportEmployeesCSV() {
    const headers = [
        { label: 'Employee ID', value: e => e.employeeId },
        { label: 'Name', value: e => e.name },
        { label: 'Phone', value: e => e.phone || '' },
        { label: 'Email', value: e => e.email || '' },
        { label: 'Department', value: e => e.department },
        { label: 'Status', value: e => e.activated ? 'Activated' : 'Pending' }
    ];
    const csv = convertToCSV(EMPLOYEES, headers);
    downloadCSV(`employees_export_${Date.now()}.csv`, csv);
}

// ==========================================
// 🔔 NOTIFICATIONS — bell icon + popup jab koi tag kare
// ==========================================
async function initNotifications(token) {
    await fetchNotifications(token);
    // Har 45 second mein naya check karo
    setInterval(() => fetchNotifications(token), 45000);
}

async function fetchNotifications(token) {
    try {
        const res = await fetch('/api/notifications', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const hadUnreadBefore = NOTIFICATIONS.some(n => !n.isRead);
        NOTIFICATIONS = data;
        renderNotificationBadge();
        renderNotificationsPanel(token);

        const unread = NOTIFICATIONS.filter(n => !n.isRead);
        // Popup sirf pehli dafa unread milne par dikhao (login ke waqt)
        if (unread.length > 0 && !window.__notifPopupShown) {
            window.__notifPopupShown = true;
            showNotificationPopup(unread);
        }
    } catch (err) {
        console.error("Notifications fetch error:", err);
    }
}

function renderNotificationBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const unreadCount = NOTIFICATIONS.filter(n => !n.isRead).length;
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

function renderNotificationsPanel() {
    const panel = document.getElementById('notificationsPanel');
    if (!panel) return;

    if (NOTIFICATIONS.length === 0) {
        panel.innerHTML = '<div style="padding: 15px; font-size: 13px; color: #718096;">Koi notification nahi.</div>';
        return;
    }

    panel.innerHTML = NOTIFICATIONS.map(n => `
        <div class="notif-item" data-id="${escapeHTML(n.id)}" style="padding: 10px 12px; border-bottom: 1px solid #edf2f7; cursor: pointer; background: ${n.isRead ? '#fff' : '#ebf8ff'};">
            <div style="font-size: 13px; color: #2d3748;">${escapeHTML(n.message)}</div>
            <div style="font-size: 11px; color: #a0aec0; margin-top: 3px;">${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
        </div>
    `).join('');
}

function toggleNotificationsPanel() {
    const panel = document.getElementById('notificationsPanel');
    if (!panel) return;
    panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
}

function showNotificationPopup(unreadNotifications) {
    const modal = document.getElementById('notificationPopupModal');
    const list = document.getElementById('notificationPopupList');
    if (!modal || !list) return;

    list.innerHTML = unreadNotifications.map(n => `
        <div style="padding: 10px 12px; border-left: 4px solid #3182ce; background: #ebf8ff; border-radius: 6px; margin-bottom: 8px;">
            <div style="font-size: 13px; color: #2d3748;">${escapeHTML(n.message)}</div>
            <div style="font-size: 11px; color: #718096; margin-top: 3px;">${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
        </div>
    `).join('');

    modal.style.display = 'flex';
}

async function markNotificationRead(id, token) {
    try {
        await fetch(`/api/notifications/${id}/read`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        await fetchNotifications(token);
    } catch (err) {
        console.error("Mark read error:", err);
    }
}

async function markAllNotificationsRead(token) {
    try {
        await fetch('/api/notifications/read-all', {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        await fetchNotifications(token);
    } catch (err) {
        console.error("Mark all read error:", err);
    }
}