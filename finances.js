/**
 * Finances.js - Expense tracker module
 * Tracks spending with charts and statistics using Chart.js.
 */
var Finances = (function () {
    'use strict';

    // ── Constants ─────────────────────────────────────────────────────────

    var STORAGE_KEY = 'was_expenses';
    var BUDGET_KEY = 'was_budget';

    var CATEGORIES = [
        { name: 'Food & Dining', color: '#ef4444' },
        { name: 'Transport', color: '#f59e0b' },
        { name: 'Housing', color: '#3b82f6' },
        { name: 'Entertainment', color: '#8b5cf6' },
        { name: 'Shopping', color: '#ec4899' },
        { name: 'Health', color: '#22c55e' },
        { name: 'Education', color: '#06b6d4' },
        { name: 'Utilities', color: '#64748b' },
        { name: 'Subscriptions', color: '#7c5cfc' },
        { name: 'Other', color: '#6b7280' }
    ];

    // ── Chart Defaults ────────────────────────────────────────────────────

    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#9898b0';
        Chart.defaults.borderColor = '#252540';
    }

    // ── State ─────────────────────────────────────────────────────────────

    var expenses = [];
    var pieChart = null;
    var barChart = null;

    // ── DOM References ────────────────────────────────────────────────────

    function el(id) {
        return document.getElementById(id);
    }

    // ── Persistence ───────────────────────────────────────────────────────

    function loadExpenses() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            expenses = data ? JSON.parse(data) : [];
        } catch (e) {
            expenses = [];
        }
    }

    function saveExpenses() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    }

    // ── Budget Persistence ──────────────────────────────────────────────

    function loadBudget() {
        try {
            var stored = localStorage.getItem(BUDGET_KEY);
            var val = parseFloat(stored);
            return isNaN(val) ? 0 : val;
        } catch (e) {
            return 0;
        }
    }

    function saveBudget(amount) {
        localStorage.setItem(BUDGET_KEY, String(amount));
    }

    // ── Budget Display ──────────────────────────────────────────────────

    function updateBudget() {
        var budget = loadBudget();

        // Calculate current month spending (same logic as updateStats)
        var currentMonth = getCurrentMonthKey();
        var monthSpent = 0;
        for (var i = 0; i < expenses.length; i++) {
            if (getMonthKey(expenses[i].date) === currentMonth) {
                monthSpent += expenses[i].amount;
            }
        }

        var displayEl = el('budget-amount-display');
        var progressFill = el('budget-progress-fill');
        var spentLabel = el('budget-spent-label');
        var remainingLabel = el('budget-remaining-label');

        if (budget === 0) {
            if (displayEl) displayEl.textContent = 'Set Budget';
            if (progressFill) {
                progressFill.style.width = '0%';
                progressFill.className = 'budget-progress-fill under-budget';
            }
            if (spentLabel) spentLabel.textContent = App.formatCurrency(monthSpent) + ' spent';
            if (remainingLabel) remainingLabel.textContent = '$0.00 remaining';
            return;
        }

        var percentage = (monthSpent / budget) * 100;
        var cappedPercent = percentage > 100 ? 100 : percentage;

        // Determine class
        var fillClass = 'under-budget';
        if (percentage > 100) {
            fillClass = 'over-budget';
        } else if (percentage >= 75) {
            fillClass = 'near-budget';
        }

        if (displayEl) {
            displayEl.textContent = App.formatCurrency(monthSpent) + ' / ' + App.formatCurrency(budget);
        }

        if (progressFill) {
            progressFill.style.width = cappedPercent.toFixed(1) + '%';
            progressFill.className = 'budget-progress-fill ' + fillClass;
        }

        if (spentLabel) {
            spentLabel.textContent = App.formatCurrency(monthSpent) + ' spent';
        }

        if (remainingLabel) {
            var remaining = budget - monthSpent;
            if (remaining >= 0) {
                remainingLabel.textContent = App.formatCurrency(remaining) + ' remaining';
            } else {
                remainingLabel.textContent = App.formatCurrency(Math.abs(remaining)) + ' over budget';
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    function getCategoryColor(categoryName) {
        for (var i = 0; i < CATEGORIES.length; i++) {
            if (CATEGORIES[i].name === categoryName) {
                return CATEGORIES[i].color;
            }
        }
        return '#6b7280';
    }

    function todayString() {
        var d = new Date();
        var year = d.getFullYear();
        var month = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function getMonthKey(dateStr) {
        // Returns 'YYYY-MM' from a 'YYYY-MM-DD' string
        return dateStr.substring(0, 7);
    }

    function formatMonthLabel(monthKey) {
        // 'YYYY-MM' -> 'Jan 2025'
        var parts = monthKey.split('-');
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var monthIdx = parseInt(parts[1], 10) - 1;
        return months[monthIdx] + ' ' + parts[0];
    }

    function getCurrentMonthKey() {
        var d = new Date();
        var year = d.getFullYear();
        var month = String(d.getMonth() + 1).padStart(2, '0');
        return year + '-' + month;
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Filtering ─────────────────────────────────────────────────────────

    function getSelectedMonth() {
        var select = el('finance-month-filter');
        return select ? select.value : 'all';
    }

    function getSelectedCategory() {
        var select = el('finance-category-filter');
        return select ? select.value : 'all';
    }

    function getFilteredExpenses() {
        var monthFilter = getSelectedMonth();
        var categoryFilter = getSelectedCategory();

        return expenses.filter(function (exp) {
            if (monthFilter !== 'all' && getMonthKey(exp.date) !== monthFilter) {
                return false;
            }
            if (categoryFilter !== 'all' && exp.category !== categoryFilter) {
                return false;
            }
            return true;
        });
    }

    // ── Stats ─────────────────────────────────────────────────────────────

    function updateStats(filtered) {
        // Total Spent (filtered)
        var totalSpent = 0;
        for (var i = 0; i < filtered.length; i++) {
            totalSpent += filtered[i].amount;
        }
        var totalEl = el('stat-total-spent');
        if (totalEl) {
            totalEl.textContent = App.formatCurrency(totalSpent);
        }

        // This Month (always current month, regardless of filter)
        var currentMonth = getCurrentMonthKey();
        var monthSpent = 0;
        for (var j = 0; j < expenses.length; j++) {
            if (getMonthKey(expenses[j].date) === currentMonth) {
                monthSpent += expenses[j].amount;
            }
        }
        var monthEl = el('stat-month-spent');
        if (monthEl) {
            monthEl.textContent = App.formatCurrency(monthSpent);
        }

        // Daily Average (filtered)
        var dailyAvg = 0;
        if (filtered.length > 0) {
            var uniqueDays = {};
            for (var k = 0; k < filtered.length; k++) {
                uniqueDays[filtered[k].date] = true;
            }
            var dayCount = Object.keys(uniqueDays).length;
            dailyAvg = dayCount > 0 ? totalSpent / dayCount : 0;
        }
        var avgEl = el('stat-daily-avg');
        if (avgEl) {
            avgEl.textContent = App.formatCurrency(dailyAvg);
        }

        // Top Category (filtered)
        var topCatEl = el('stat-top-category');
        if (topCatEl) {
            if (filtered.length === 0) {
                topCatEl.textContent = '--';
            } else {
                var catTotals = {};
                for (var m = 0; m < filtered.length; m++) {
                    var cat = filtered[m].category;
                    catTotals[cat] = (catTotals[cat] || 0) + filtered[m].amount;
                }
                var topCat = '';
                var topAmount = 0;
                for (var catName in catTotals) {
                    if (catTotals.hasOwnProperty(catName) && catTotals[catName] > topAmount) {
                        topAmount = catTotals[catName];
                        topCat = catName;
                    }
                }
                topCatEl.textContent = topCat;
            }
        }
    }

    // ── Table Rendering ───────────────────────────────────────────────────

    function renderTable(filtered) {
        var tbody = el('expenses-tbody');
        var table = el('expenses-table');
        var empty = el('expenses-empty');

        if (!tbody) {
            return;
        }

        // Sort by date descending
        var sorted = filtered.slice().sort(function (a, b) {
            if (a.date > b.date) return -1;
            if (a.date < b.date) return 1;
            // Secondary sort by createdAt descending for same-day items
            if (a.createdAt > b.createdAt) return -1;
            if (a.createdAt < b.createdAt) return 1;
            return 0;
        });

        var tableContainer = table ? table.closest('.table-container') : null;

        if (sorted.length === 0) {
            tbody.innerHTML = '';
            if (tableContainer) tableContainer.style.display = 'none';
            if (empty) empty.style.display = '';
            return;
        }

        if (tableContainer) tableContainer.style.display = '';
        if (empty) empty.style.display = 'none';

        var editIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">'
            + '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'
            + '<path d="m15 5 4 4"/>'
            + '</svg>';

        var deleteIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">'
            + '<polyline points="3 6 5 6 21 6"/>'
            + '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
            + '</svg>';

        var html = '';
        for (var i = 0; i < sorted.length; i++) {
            var exp = sorted[i];
            var color = getCategoryColor(exp.category);
            html += '<tr data-id="' + exp.id + '">'
                + '<td>' + App.formatDate(exp.date) + '</td>'
                + '<td><span class="category-badge" style="color: ' + color + '">&bull; ' + escapeHtml(exp.category) + '</span></td>'
                + '<td>' + escapeHtml(exp.description) + '</td>'
                + '<td>' + App.formatCurrency(exp.amount) + '</td>'
                + '<td class="td-actions">'
                + '<button class="btn-icon" data-action="edit" title="Edit">' + editIcon + '</button>'
                + '<button class="btn-icon" data-action="delete" title="Delete">' + deleteIcon + '</button>'
                + '</td>'
                + '</tr>';
        }

        tbody.innerHTML = html;
    }

    // ── Charts ────────────────────────────────────────────────────────────

    function updatePieChart(monthFilter) {
        var canvas = el('expense-chart-pie');
        if (!canvas || typeof Chart === 'undefined') {
            return;
        }

        // Pie chart reflects the month filter
        var filtered = expenses.filter(function (exp) {
            if (monthFilter !== 'all' && getMonthKey(exp.date) !== monthFilter) {
                return false;
            }
            return true;
        });

        // Aggregate by category
        var catTotals = {};
        for (var i = 0; i < filtered.length; i++) {
            var cat = filtered[i].category;
            catTotals[cat] = (catTotals[cat] || 0) + filtered[i].amount;
        }

        var labels = [];
        var data = [];
        var colors = [];

        for (var j = 0; j < CATEGORIES.length; j++) {
            var catName = CATEGORIES[j].name;
            if (catTotals[catName] && catTotals[catName] > 0) {
                labels.push(catName);
                data.push(catTotals[catName]);
                colors.push(CATEGORIES[j].color);
            }
        }

        // Destroy existing chart
        if (pieChart) {
            pieChart.destroy();
            pieChart = null;
        }

        pieChart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderColor: '#0d0d22',
                    borderWidth: 3,
                    hoverBorderColor: '#1a1a3e',
                    hoverBorderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                animation: { animateRotate: true, duration: 800, easing: 'easeOutQuart' },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#9898b0',
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(13, 13, 34, 0.9)',
                        borderColor: 'rgba(124, 92, 252, 0.2)',
                        borderWidth: 1,
                        titleColor: '#ededff',
                        bodyColor: '#a0a0c0',
                        cornerRadius: 10,
                        padding: 12,
                        callbacks: {
                            label: function (context) {
                                var total = context.dataset.data.reduce(function (sum, val) {
                                    return sum + val;
                                }, 0);
                                var value = context.parsed;
                                var pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return context.label + ': ' + App.formatCurrency(value) + ' (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    }

    function updateBarChart() {
        var canvas = el('expense-chart-bar');
        if (!canvas || typeof Chart === 'undefined') {
            return;
        }

        // Always shows last 6 months regardless of filters
        var now = new Date();
        var monthKeys = [];
        for (var i = 5; i >= 0; i--) {
            var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            monthKeys.push(key);
        }

        // Aggregate spending by month
        var monthTotals = {};
        for (var j = 0; j < monthKeys.length; j++) {
            monthTotals[monthKeys[j]] = 0;
        }
        for (var k = 0; k < expenses.length; k++) {
            var mk = getMonthKey(expenses[k].date);
            if (monthTotals.hasOwnProperty(mk)) {
                monthTotals[mk] += expenses[k].amount;
            }
        }

        var labels = monthKeys.map(formatMonthLabel);
        var data = monthKeys.map(function (mk) {
            return monthTotals[mk];
        });

        // Destroy existing chart
        if (barChart) {
            barChart.destroy();
            barChart = null;
        }

        // Create gradient for bars
        var ctx2d = canvas.getContext('2d');
        var barGradient = ctx2d.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 280);
        barGradient.addColorStop(0, '#9078ff');
        barGradient.addColorStop(1, '#5a3de0');

        barChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Monthly Spending',
                    data: data,
                    backgroundColor: barGradient,
                    borderColor: 'transparent',
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    hoverBackgroundColor: '#a890ff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 800, easing: 'easeOutQuart' },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                        ticks: { color: '#9898b0', font: { size: 11 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                        ticks: {
                            color: '#9898b0',
                            callback: function (value) { return '$' + value; },
                            font: { size: 11 }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(13, 13, 34, 0.9)',
                        borderColor: 'rgba(124, 92, 252, 0.2)',
                        borderWidth: 1,
                        titleColor: '#ededff',
                        bodyColor: '#a0a0c0',
                        cornerRadius: 10,
                        padding: 12,
                        callbacks: {
                            label: function (context) {
                                return App.formatCurrency(context.parsed.y);
                            }
                        }
                    }
                }
            }
        });
    }

    // ── Month Filter Population ───────────────────────────────────────────

    function populateMonthFilter() {
        var select = el('finance-month-filter');
        if (!select) {
            return;
        }

        var currentValue = select.value;

        // Collect unique months from expenses
        var monthSet = {};
        for (var i = 0; i < expenses.length; i++) {
            var mk = getMonthKey(expenses[i].date);
            monthSet[mk] = true;
        }

        var months = Object.keys(monthSet).sort().reverse();

        var html = '<option value="all">All Time</option>';
        for (var j = 0; j < months.length; j++) {
            html += '<option value="' + months[j] + '">' + formatMonthLabel(months[j]) + '</option>';
        }

        select.innerHTML = html;

        // Restore previous selection if it still exists
        if (currentValue && select.querySelector('option[value="' + currentValue + '"]')) {
            select.value = currentValue;
        }
    }

    // ── Category Filter / Select Population ───────────────────────────────

    function populateCategorySelect() {
        var select = el('expense-category');
        if (!select) {
            return;
        }

        var html = '';
        for (var i = 0; i < CATEGORIES.length; i++) {
            html += '<option value="' + escapeHtml(CATEGORIES[i].name) + '">' + escapeHtml(CATEGORIES[i].name) + '</option>';
        }
        select.innerHTML = html;
    }

    function populateCategoryFilter() {
        var select = el('finance-category-filter');
        if (!select) {
            return;
        }

        var currentValue = select.value;

        var html = '<option value="all">All Categories</option>';
        for (var i = 0; i < CATEGORIES.length; i++) {
            html += '<option value="' + escapeHtml(CATEGORIES[i].name) + '">' + escapeHtml(CATEGORIES[i].name) + '</option>';
        }
        select.innerHTML = html;

        if (currentValue && select.querySelector('option[value="' + CSS.escape(currentValue) + '"]')) {
            select.value = currentValue;
        }
    }

    // ── Full Render ───────────────────────────────────────────────────────

    function render() {
        populateMonthFilter();
        var filtered = getFilteredExpenses();
        renderTable(filtered);
        updateStats(filtered);
        updatePieChart(getSelectedMonth());
        updateBarChart();
        updateBudget();
    }

    // ── CRUD Operations ───────────────────────────────────────────────────

    function openAddModal() {
        var titleEl = el('expense-modal-title');
        if (titleEl) {
            titleEl.textContent = 'Add Expense';
        }

        // Reset form
        var form = el('expense-form');
        if (form) {
            form.reset();
        }

        var idField = el('expense-id');
        if (idField) {
            idField.value = '';
        }

        // Default date to today
        var dateField = el('expense-date');
        if (dateField) {
            dateField.value = todayString();
        }

        App.showModal('expense-modal');
    }

    function openEditModal(id) {
        var expense = expenses.find(function (exp) {
            return exp.id === id;
        });
        if (!expense) {
            return;
        }

        var titleEl = el('expense-modal-title');
        if (titleEl) {
            titleEl.textContent = 'Edit Expense';
        }

        var idField = el('expense-id');
        if (idField) {
            idField.value = expense.id;
        }

        var dateField = el('expense-date');
        if (dateField) {
            dateField.value = expense.date;
        }

        var catField = el('expense-category');
        if (catField) {
            catField.value = expense.category;
        }

        var descField = el('expense-description');
        if (descField) {
            descField.value = expense.description;
        }

        var amountField = el('expense-amount');
        if (amountField) {
            amountField.value = expense.amount;
        }

        App.showModal('expense-modal');
    }

    function handleFormSubmit(e) {
        e.preventDefault();

        var idField = el('expense-id');
        var dateField = el('expense-date');
        var catField = el('expense-category');
        var descField = el('expense-description');
        var amountField = el('expense-amount');

        var id = idField ? idField.value : '';
        var date = dateField ? dateField.value : '';
        var category = catField ? catField.value : '';
        var description = descField ? descField.value.trim() : '';
        var amount = amountField ? parseFloat(amountField.value) : 0;

        if (!date || !category || !description || isNaN(amount) || amount <= 0) {
            App.toast('Please fill in all fields correctly', 'error');
            return;
        }

        if (id) {
            // Edit existing
            var expense = expenses.find(function (exp) {
                return exp.id === id;
            });
            if (expense) {
                expense.date = date;
                expense.category = category;
                expense.description = description;
                expense.amount = amount;
                App.toast('Expense updated', 'success');
            }
        } else {
            // Add new
            expenses.push({
                id: App.generateId(),
                date: date,
                category: category,
                description: description,
                amount: amount,
                createdAt: new Date().toISOString()
            });
            App.toast('Expense added', 'success');
        }

        saveExpenses();
        App.closeModal('expense-modal');
        render();
    }

    function deleteExpense(id) {
        expenses = expenses.filter(function (exp) {
            return exp.id !== id;
        });
        saveExpenses();
        render();
        App.toast('Expense deleted', 'success');
    }

    // ── Event Handlers ────────────────────────────────────────────────────

    function handleTableClick(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) {
            return;
        }

        var row = btn.closest('tr');
        if (!row) {
            return;
        }

        var id = row.getAttribute('data-id');
        var action = btn.getAttribute('data-action');

        if (action === 'edit') {
            openEditModal(id);
        } else if (action === 'delete') {
            deleteExpense(id);
        }
    }

    // ── Initialization ────────────────────────────────────────────────────

    function init() {
        // Load data
        loadExpenses();

        // Populate select elements
        populateCategorySelect();
        populateCategoryFilter();

        // Initial render
        render();

        // Add Expense button
        var addBtn = el('add-expense-btn');
        if (addBtn) {
            addBtn.addEventListener('click', openAddModal);
        }

        // Budget edit button
        var budgetBtn = el('budget-edit-btn');
        if (budgetBtn) {
            budgetBtn.addEventListener('click', function () {
                var current = loadBudget();
                var input = prompt('Enter monthly budget amount:', current > 0 ? current : '');
                if (input === null) return;
                var amount = parseFloat(input);
                if (isNaN(amount) || amount <= 0) {
                    App.toast('Please enter a valid amount greater than 0', 'error');
                    return;
                }
                saveBudget(amount);
                updateBudget();
                App.toast('Budget set to ' + App.formatCurrency(amount), 'success');
            });
        }

        // Form submit
        var form = el('expense-form');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        // Table click delegation
        var tbody = el('expenses-tbody');
        if (tbody) {
            tbody.addEventListener('click', handleTableClick);
        }

        // Filter change handlers
        var monthFilter = el('finance-month-filter');
        if (monthFilter) {
            monthFilter.addEventListener('change', function () {
                var filtered = getFilteredExpenses();
                renderTable(filtered);
                updateStats(filtered);
                updatePieChart(getSelectedMonth());
                // Bar chart always shows last 6 months, no need to update
            });
        }

        var categoryFilter = el('finance-category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', function () {
                var filtered = getFilteredExpenses();
                renderTable(filtered);
                updateStats(filtered);
                // Pie chart only reflects month filter, not category
                // so no need to update pie chart on category change
            });
        }
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── Public API ────────────────────────────────────────────────────────

    return {
        addExpense: openAddModal,
        render: render
    };
})();
