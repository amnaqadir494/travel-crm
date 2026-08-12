let currentUser = null;
let allLeads = [];
let EMPLOYEES = [];
let currentEditingLeadId = null;
let currentEditingEmployeeId = null;

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

    setupToggleButton('toggleEmployeesBtn', 'employeeManagementCard');
    setupToggleButton('toggleAddLeadBtn', 'addLeadCard');
    setupToggleButton('toggleAnalyticsBtn', 'dashboardAnalyticsSection');
    setupToggleButton('toggleLeadsBtn', 'leadsManagementCard');

    loadLeads(token);

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
        document.getElementById('editPassengersModal').style.display = 'none';
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
            document.getElementById('travellerSection').style.display = 'block';
            document.getElementById('followUpSection').style.display = 'none';
            document.getElementById('documentSection').style.display = 'none';
        }
        if (e.target && e.target.id === 'btnOpenFollowUp') {
            document.getElementById('travellerSection').style.display = 'none';
            document.getElementById('followUpSection').style.display = 'block';
            document.getElementById('documentSection').style.display = 'none';
        }
        if (e.target && e.target.id === 'btnOpenDocument') {
            document.getElementById('travellerSection').style.display = 'none';
            document.getElementById('followUpSection').style.display = 'none';
            document.getElementById('documentSection').style.display = 'block';
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

    const leadsTableBody = document.getElementById('leadsTableBody');
    leadsTableBody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-danger');
        if (deleteBtn) {
            deleteLead(deleteBtn.getAttribute('data-id'), token);
            return;
        }

        const editBtn = e.target.closest('.btn-edit-passengers');
        if (editBtn) {
            const leadId = editBtn.getAttribute('data-id');
            if (leadId) openEditPassengersModal(leadId);
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
});

function setupToggleButton(btnId, sectionId) {
    const btn = document.getElementById(btnId);
    const section = document.getElementById(sectionId);
    if (!btn || !section) return;

    btn.addEventListener('click', () => {
        const isHidden = section.style.display === 'none' || getComputedStyle(section).display === 'none';
        section.style.setProperty('display', isHidden ? 'block' : 'none', 'important');
    });
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
            <td>${escapeHTML(emp.email)}</td>
            <td>${escapeHTML(emp.department)}</td>
            <td>${statusBadge}</td>
            <td>
                <button type="button" class="btn-edit btn-edit-employee" data-id="${escapeHTML(emp.id)}">Edit</button>
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
    const email = document.getElementById('empEmail').value;
    const department = document.getElementById('empDepartment').value;

    try {
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, email, department })
        });

        const data = await res.json();
        if (!res.ok) {
            msgBox.innerText = data.error || 'Failed to add employee';
            msgBox.style.display = 'block';
            return;
        }

        document.getElementById('addEmployeeForm').reset();
        successBox.innerText = `Employee successfully added!`;
        successBox.style.display = 'block';
        setTimeout(() => { successBox.style.display = 'none'; }, 3000);

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
    document.getElementById('editEmpEmail').value = emp.email;
    document.getElementById('editEmpDepartment').value = emp.department;
    document.getElementById('editEmpMsg').style.display = 'none';
    document.getElementById('editEmployeeModal').style.display = 'flex';
}

async function saveEditedEmployee(token) {
    if (!currentEditingEmployeeId) return;

    const msgBox = document.getElementById('editEmpMsg');
    msgBox.style.display = 'none';

    const name = document.getElementById('editEmpName').value;
    const email = document.getElementById('editEmpEmail').value;
    const department = document.getElementById('editEmpDepartment').value;

    try {
        const res = await fetch(`/api/admin/users/${currentEditingEmployeeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, email, department })
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

const FIELD_DEPARTMENT = {
    assignedVisa: 'Visa',
    assignedTicketing: 'Ticketing',
    assignedFinance: 'Finance',
    assignedTour: 'Tour'
};

function buildAssignCell(lead, fieldKey) {
    const currentValue = lead[fieldKey] || '';
    const targetDept = FIELD_DEPARTMENT[fieldKey];

    const relevantEmployees = EMPLOYEES.filter(emp => (emp.department || '').trim().toLowerCase() === targetDept.toLowerCase());

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
        const colCount = currentUser.department === 'Admin' ? 11 : 10;
        tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align: center; padding: 20px; color: #718096; font-weight: 600;">No results found</td></tr>`;
        return;
    }

    const isAdmin = currentUser.department === 'Admin';

    leads.forEach(lead => {
        const tr = document.createElement('tr');
        const nameMatched = searchQuery && (lead.name || '').toLowerCase().includes(searchQuery);
        const nameCellStyle = nameMatched ? 'background-color: #c6f6d5; font-weight: 600; color: #22543d;' : '';

        let passengersHtml = '';
        if (lead.passengers && lead.passengers.length > 0) {
            passengersHtml = lead.passengers.map((p, idx) => {
                return `<div style="font-size: 12px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; margin-bottom: 4px;"><strong>P${idx + 1}:</strong> ${escapeHTML(p.name || 'N/A')} | Pass: ${escapeHTML(p.passport || 'N/A')} ${p.ageCategory ? `| ${escapeHTML(p.ageCategory)}` : ''}</div>`;
            }).join('');
        } else {
            passengersHtml = '<div style="margin-bottom: 5px;">N/A</div>';
        }

        if (lead.documents && lead.documents.length > 0) {
            passengersHtml += '<div style="font-size: 12px; margin-top: 6px;"><strong>📄 Documents:</strong><br>' +
                lead.documents.map(d => `- ${escapeHTML(d.name || 'Doc')} ${d.url ? `(<a href="${escapeHTML(d.url)}" target="_blank" style="color: #3182ce; font-weight: bold;">View</a>)` : ''}`).join('<br>') +
                '</div>';
        }

        if (lead.followUpNotes && lead.followUpNotes.length > 0) {
            lead.followUpNotes.forEach(note => {
                passengersHtml += `<div style="background: #fffaf0; border-left: 3px solid #d69e2e; padding: 4px 6px; font-size: 11px; margin-top: 4px; border-radius: 4px;"><strong>Follow-up (${escapeHTML(note.time)}):</strong> ${escapeHTML(note.text)}</div>`;
            });
        }

        const createdAtStr = lead.createdAtTime || 'N/A';
        const updatedAtStr = lead.updatedAtTime || 'N/A';
        
        passengersHtml += `
            <div style="font-size: 10px; color: #4a5568; margin-top: 8px; border-top: 1px solid #e2e8f0; paddingTop: 4px; background: #edf2f7; padding: 4px; border-radius: 4px;">
                <div><strong>Created:</strong> ${escapeHTML(lead.createdBy || 'System')} (${createdAtStr})</div>
                <div><strong>Last Updated:</strong> ${escapeHTML(lead.updatedBy || 'System')} (${updatedAtStr})</div>
            </div>
        `;

        passengersHtml += `<button type="button" class="btn-primary btn-edit-passengers" data-id="${escapeHTML(lead.id)}" style="padding: 4px 10px; font-size: 11px; margin-top: 5px; cursor: pointer;">Edit / Upload Docs</button>`;

        tr.innerHTML = `
            <td style="${nameCellStyle}">${escapeHTML(lead.name)}</td>
            <td>${escapeHTML(lead.email)}</td>
            <td>${escapeHTML(lead.phone)}</td>
            <td>${escapeHTML(lead.destination)}</td>
            <td>${buildSourceCell(lead)}</td>
            <td>${passengersHtml}</td>
            <td>${buildAssignCell(lead, 'assignedVisa')}</td>
            <td>${buildAssignCell(lead, 'assignedTicketing')}</td>
            <td>${buildAssignCell(lead, 'assignedFinance')}</td>
            <td>${buildAssignCell(lead, 'assignedTour')}</td>
            <td style="display: ${isAdmin ? 'table-cell' : 'none'};">
                ${isAdmin ? `<button class="btn-danger" data-id="${escapeHTML(lead.id)}">Delete</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openEditPassengersModal(leadId) {
    let lead = allLeads.find(l => String(l.id) === String(leadId));
    if (!lead) lead = { id: leadId, passengers: [], followUpNotes: [], documents: [] };

    currentEditingLeadId = leadId;
    const currentCount = lead.numberOfPersons || (lead.passengers ? lead.passengers.length : 1);

    document.getElementById('travellerSection').style.display = 'none';
    document.getElementById('followUpSection').style.display = 'none';
    document.getElementById('documentSection').style.display = 'none';

    document.getElementById('modalNumPersons').value = currentCount;
    renderModalPassengerInputs(currentCount, lead.passengers || []);

    let leadSummaryBox = document.getElementById('modalLeadSummaryBox');
    if (!leadSummaryBox) {
        leadSummaryBox = document.createElement('div');
        leadSummaryBox.id = 'modalLeadSummaryBox';
        const titleEl = document.querySelector('#editPassengersModal h3');
        if (titleEl) titleEl.insertAdjacentElement('afterend', leadSummaryBox);
    }
    
    const createdAtStr = lead.createdAtTime || 'N/A';
    const updatedAtStr = lead.updatedAtTime || 'N/A';

    leadSummaryBox.style.cssText = 'background: #f7fafc; border: 1px solid #cbd5e0; border-left: 4px solid #3182ce; padding: 10px 14px; border-radius: 6px; margin-bottom: 15px; font-size: 13px; color: #2d3748;';
    leadSummaryBox.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 4px; color: #2b6cb0;">📋 Lead Details & Audit Trail</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <div><strong>Name:</strong> ${escapeHTML(lead.name || 'N/A')}</div>
            <div><strong>Email:</strong> ${escapeHTML(lead.email || 'N/A')}</div>
            <div><strong>Phone:</strong> ${escapeHTML(lead.phone || 'N/A')}</div>
            <div><strong>Destination:</strong> ${escapeHTML(lead.destination || 'N/A')}</div>
            <div style="grid-column: span 2;"><strong>Source:</strong> ${escapeHTML(lead.source || 'Direct')}</div>
            <div style="grid-column: span 2; border-top: 1px dashed #cbd5e0; margin-top: 4px; padding-top: 4px; font-size: 11px; color: #4a5568;">
                <div><strong>Created By:</strong> ${escapeHTML(lead.createdBy || 'System')} at ${createdAtStr}</div>
                <div><strong>Last Updated By:</strong> ${escapeHTML(lead.updatedBy || 'System')} at ${updatedAtStr}</div>
            </div>
        </div>
    `;

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

    document.getElementById('editPassengersModal').style.display = 'flex';
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

    // 🕒 Current logged-in user ka naam aur exact time fetch karein
    const currentModifier = currentUser ? `${currentUser.name} (${currentUser.department})` : 'Unknown';
    const currentDateTime = new Date().toLocaleString();
    formData.append('updatedBy', currentModifier);
    formData.append('updatedAtTime', currentDateTime);

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
            document.getElementById('editPassengersModal').style.display = 'none';
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