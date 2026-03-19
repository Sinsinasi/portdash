/**
 * Trading Journal Module — Forex-optimized
 * P&L = (exit - entry) * lots * lotSize - fees
 * Supports standard (100K), mini (10K), micro (1K) lot sizes.
 * Backward-compatible: old trades without lotSize default to lotSize=1.
 */
const Trading = (function () {
    'use strict';

    const STORAGE_KEY = 'was_trades';
    let equityChart = null;

    // ── Data Access ────────────────────────────────────────────────────

    function loadTrades() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Trading: failed to load trades', e);
            return [];
        }
    }

    function saveTrades(trades) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    }

    // ── P&L Calculation ───────────────────────────────────────────────

    function calcPnL(trade) {
        if (trade.status !== 'closed' || trade.exitPrice == null) {
            return null;
        }
        const lotSize = trade.lotSize || 1; // backward compat for old stock trades
        const diff = trade.type === 'long'
            ? trade.exitPrice - trade.entryPrice
            : trade.entryPrice - trade.exitPrice;
        return diff * trade.quantity * lotSize - (trade.fees || 0);
    }

    /**
     * Planned R:R from SL/TP (what you aimed for).
     */
    function calcPlannedRR(trade) {
        if (trade.slPrice == null || trade.tpPrice == null) return null;
        var risk, reward;
        if (trade.type === 'long') {
            risk = trade.entryPrice - trade.slPrice;
            reward = trade.tpPrice - trade.entryPrice;
        } else {
            risk = trade.slPrice - trade.entryPrice;
            reward = trade.entryPrice - trade.tpPrice;
        }
        if (risk <= 0) return null;
        return Math.round((reward / risk) * 100) / 100;
    }

    /**
     * Actual R:R from SL and real exit (what you actually got).
     * Uses risk = |entry - SL| and reward = actual P&L direction.
     */
    function calcActualRR(trade) {
        if (trade.slPrice == null || trade.exitPrice == null || trade.status !== 'closed') return null;
        var risk, reward;
        if (trade.type === 'long') {
            risk = trade.entryPrice - trade.slPrice;
            reward = trade.exitPrice - trade.entryPrice;
        } else {
            risk = trade.slPrice - trade.entryPrice;
            reward = trade.entryPrice - trade.exitPrice;
        }
        if (risk <= 0) return null;
        return Math.round((reward / risk) * 100) / 100;
    }

    /**
     * Calculate pips for a forex trade.
     * JPY pairs (price > 10) use 0.01 pip size, others use 0.0001.
     */
    function calcPips(trade) {
        if (trade.status !== 'closed' || trade.exitPrice == null) return null;
        const diff = trade.type === 'long'
            ? trade.exitPrice - trade.entryPrice
            : trade.entryPrice - trade.exitPrice;
        // Detect JPY pair by price magnitude
        const pipSize = (trade.entryPrice > 10) ? 0.01 : 0.0001;
        return Math.round(diff / pipSize * 10) / 10;
    }

    // ── Statistics ─────────────────────────────────────────────────────

    function calcStats(trades) {
        // Sort closed trades by date so the equity curve is chronological
        const closedTrades = trades
            .filter(function (t) { return t.status === 'closed' && t.exitPrice != null; })
            .slice()
            .sort(function (a, b) {
                if (a.date < b.date) return -1;
                if (a.date > b.date) return 1;
                if (a.createdAt < b.createdAt) return -1;
                if (a.createdAt > b.createdAt) return 1;
                return 0;
            });

        const closedPnLs = [];
        for (let i = 0; i < closedTrades.length; i++) {
            const pnl = calcPnL(closedTrades[i]);
            if (pnl !== null) closedPnLs.push(pnl);
        }

        let totalPnL = 0, wins = [], losses = [];
        for (let j = 0; j < closedPnLs.length; j++) {
            totalPnL += closedPnLs[j];
            if (closedPnLs[j] > 0) wins.push(closedPnLs[j]);
            else if (closedPnLs[j] < 0) losses.push(closedPnLs[j]);
        }

        const closedCount = closedPnLs.length;

        // Streak calculation from date-sorted closed trades
        var currentWinStreak = 0;
        var currentLossStreak = 0;
        var maxWinStreak = 0;
        var maxLossStreak = 0;
        var tempWinStreak = 0;
        var tempLossStreak = 0;

        for (var s = 0; s < closedPnLs.length; s++) {
            if (closedPnLs[s] > 0) {
                tempWinStreak++;
                tempLossStreak = 0;
            } else if (closedPnLs[s] < 0) {
                tempLossStreak++;
                tempWinStreak = 0;
            } else {
                tempWinStreak = 0;
                tempLossStreak = 0;
            }
            if (tempWinStreak > maxWinStreak) maxWinStreak = tempWinStreak;
            if (tempLossStreak > maxLossStreak) maxLossStreak = tempLossStreak;
        }
        currentWinStreak = tempWinStreak;
        currentLossStreak = tempLossStreak;

        // Win rate (winning trades / closed trades — standard prop firm formula)
        const winRate = closedCount === 0
            ? '--'
            : ((wins.length / closedCount) * 100).toFixed(1) + '%';

        // Profit factor
        let profitFactor = '--';
        if (closedCount > 0) {
            if (wins.length === 0) profitFactor = '0.00';
            else if (losses.length === 0) profitFactor = '\u221E';
            else {
                const sumWins = wins.reduce((a, b) => a + b, 0);
                const sumLosses = losses.reduce((a, b) => a + b, 0);
                profitFactor = (sumWins / Math.abs(sumLosses)).toFixed(2);
            }
        }

        // Averages (keep raw numbers for breakeven calc)
        const avgWinRaw = wins.length === 0 ? 0
            : wins.reduce((a, b) => a + b, 0) / wins.length;
        const avgLossRaw = losses.length === 0 ? 0
            : Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length);
        const avgWin = wins.length === 0 ? '$0.00' : '$' + avgWinRaw.toFixed(2);
        const avgLoss = losses.length === 0 ? '$0.00' : '-$' + avgLossRaw.toFixed(2);

        // Best / Worst trade
        let bestTrade = closedPnLs.length ? Math.max(...closedPnLs) : null;
        let worstTrade = closedPnLs.length ? Math.min(...closedPnLs) : null;

        // Collect dates for the equity curve x-axis
        const closedDates = closedTrades.map(function (t) { return t.date; });

        // Planned R:R (from SL/TP)
        var plannedRRs = [];
        var actualRRs = [];
        for (var ri = 0; ri < trades.length; ri++) {
            var prr = calcPlannedRR(trades[ri]);
            if (prr !== null && prr > 0) plannedRRs.push(prr);
            var arr = calcActualRR(trades[ri]);
            if (arr !== null) actualRRs.push(arr);
        }
        var avgPlannedRR = plannedRRs.length > 0
            ? Math.round((plannedRRs.reduce(function(a, b) { return a + b; }, 0) / plannedRRs.length) * 100) / 100
            : null;
        var avgActualRR = actualRRs.length > 0
            ? Math.round((actualRRs.reduce(function(a, b) { return a + b; }, 0) / actualRRs.length) * 100) / 100
            : null;
        // Breakeven win rate based on actual avg win/loss (prop firm formula)
        // Formula: |Avg Loss| / (Avg Win + |Avg Loss|) × 100
        var breakevenWR = (avgWinRaw > 0 && avgLossRaw > 0)
            ? Math.round((avgLossRaw / (avgWinRaw + avgLossRaw)) * 1000) / 10
            : null;

        // Missed trades stats
        const missedTrades = trades.filter(function (t) { return t.status === 'missed'; });
        let missedPnL = 0;
        for (let mi = 0; mi < missedTrades.length; mi++) {
            const mp = calcMissedPnL(missedTrades[mi]);
            if (mp !== null) missedPnL += mp;
        }

        return {
            totalPnL, winRate, totalTrades: closedCount, profitFactor,
            avgWin, avgLoss, bestTrade, worstTrade,
            hasWins: wins.length > 0, hasLosses: losses.length > 0,
            closedPnLs, closedDates,
            currentWinStreak: currentWinStreak,
            currentLossStreak: currentLossStreak,
            maxWinStreak: maxWinStreak,
            maxLossStreak: maxLossStreak,
            missedCount: missedTrades.length,
            missedPnL: missedPnL,
            avgPlannedRR: avgPlannedRR,
            avgActualRR: avgActualRR,
            breakevenWR: breakevenWR
        };
    }

    // ── DOM Helpers ────────────────────────────────────────────────────

    function el(id) { return document.getElementById(id); }

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function formatPnL(value) {
        if (value === null) return '--';
        const rounded = Math.round(value * 100) / 100;
        return rounded >= 0
            ? '+$' + rounded.toFixed(2)
            : '-$' + Math.abs(rounded).toFixed(2);
    }

    function pnlClass(value) {
        if (value === null) return 'pnl-zero';
        if (value > 0) return 'pnl-positive';
        if (value < 0) return 'pnl-negative';
        return 'pnl-zero';
    }

    /** Format price with appropriate decimal places for forex */
    function formatPrice(val) {
        if (val == null) return '--';
        const num = parseFloat(val);
        // JPY pairs / large prices: 3 decimals; otherwise 5 decimals
        const decimals = num > 10 ? 3 : 5;
        return num.toFixed(decimals);
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ── Rendering ──────────────────────────────────────────────────────

    function renderStats(trades) {
        const stats = calcStats(trades);

        // Total P&L
        const totalPnLEl = el('stat-total-pnl');
        const roundedTotal = Math.round(stats.totalPnL * 100) / 100;
        totalPnLEl.textContent = roundedTotal >= 0
            ? '+$' + roundedTotal.toFixed(2)
            : '-$' + Math.abs(roundedTotal).toFixed(2);
        totalPnLEl.classList.remove('positive', 'negative');
        if (roundedTotal > 0) totalPnLEl.classList.add('positive');
        else if (roundedTotal < 0) totalPnLEl.classList.add('negative');

        el('stat-win-rate').textContent = stats.winRate;
        el('stat-total-trades').textContent = stats.totalTrades;
        el('stat-profit-factor').textContent = stats.profitFactor;

        // Avg Win
        const avgWinEl = el('stat-avg-win');
        avgWinEl.textContent = stats.avgWin;
        avgWinEl.classList.remove('positive', 'negative');
        if (stats.hasWins) avgWinEl.classList.add('positive');

        // Avg Loss
        const avgLossEl = el('stat-avg-loss');
        avgLossEl.textContent = stats.avgLoss;
        avgLossEl.classList.remove('positive', 'negative');
        if (stats.hasLosses) avgLossEl.classList.add('negative');

        // Best Trade
        const bestEl = el('stat-best-trade');
        if (bestEl) {
            bestEl.textContent = formatPnL(stats.bestTrade);
            bestEl.classList.remove('positive', 'negative');
            if (stats.bestTrade > 0) bestEl.classList.add('positive');
        }

        // Worst Trade
        const worstEl = el('stat-worst-trade');
        if (worstEl) {
            worstEl.textContent = formatPnL(stats.worstTrade);
            worstEl.classList.remove('positive', 'negative');
            if (stats.worstTrade < 0) worstEl.classList.add('negative');
        }

        // Win Streak
        var winStreakEl = el('stat-win-streak');
        if (winStreakEl) {
            var winBadge = winStreakEl.querySelector('.streak-badge-win');
            if (winBadge) winBadge.textContent = stats.currentWinStreak;
        }

        // Loss Streak
        var lossStreakEl = el('stat-loss-streak');
        if (lossStreakEl) {
            var lossBadge = lossStreakEl.querySelector('.streak-badge-loss');
            if (lossBadge) lossBadge.textContent = stats.currentLossStreak;
        }

        // Avg Planned R:R
        var avgPRREl = el('stat-avg-planned-rr');
        if (avgPRREl) avgPRREl.textContent = stats.avgPlannedRR !== null ? '1:' + stats.avgPlannedRR.toFixed(2) : '--';

        // Avg Actual R:R (R-multiple format)
        var avgARREl = el('stat-avg-actual-rr');
        if (avgARREl) {
            if (stats.avgActualRR !== null) {
                avgARREl.textContent = (stats.avgActualRR >= 0 ? '+' : '') + stats.avgActualRR.toFixed(2) + 'R';
                avgARREl.classList.remove('positive', 'negative');
                if (stats.avgActualRR > 0) avgARREl.classList.add('positive');
                else if (stats.avgActualRR < 0) avgARREl.classList.add('negative');
            } else {
                avgARREl.textContent = '--';
                avgARREl.classList.remove('positive', 'negative');
            }
        }

        // Breakeven WR
        var beWREl = el('stat-breakeven-wr');
        if (beWREl) beWREl.textContent = stats.breakevenWR !== null ? stats.breakevenWR + '%' : '--';

        // Missed trades
        var missedCard = el('stat-missed-card');
        var missedPnlCard = el('stat-missed-pnl-card');
        if (missedCard && missedPnlCard) {
            if (stats.missedCount > 0) {
                missedCard.style.display = '';
                missedPnlCard.style.display = '';
                el('stat-missed-count').textContent = stats.missedCount;
                var missedPnlEl = el('stat-missed-pnl');
                var roundedMissed = Math.round(stats.missedPnL * 100) / 100;
                missedPnlEl.textContent = formatPnL(roundedMissed);
                missedPnlEl.classList.remove('positive', 'negative');
                if (roundedMissed > 0) missedPnlEl.classList.add('positive');
                else if (roundedMissed < 0) missedPnlEl.classList.add('negative');
            } else {
                missedCard.style.display = 'none';
                missedPnlCard.style.display = 'none';
            }
        }

        // Equity curve
        renderEquityCurve(stats.closedPnLs, stats.closedDates);
    }

    function renderEquityCurve(closedPnLs, closedDates) {
        closedDates = closedDates || [];
        const canvas = el('equity-curve');
        if (!canvas || closedPnLs.length === 0) {
            const container = el('equity-curve-card');
            if (container) container.style.display = closedPnLs.length === 0 ? 'none' : '';
            return;
        }
        const container = el('equity-curve-card');
        if (container) container.style.display = '';

        // Build cumulative equity
        const equityData = [0];
        let running = 0;
        for (let i = 0; i < closedPnLs.length; i++) {
            running += closedPnLs[i];
            equityData.push(Math.round(running * 100) / 100);
        }

        // Use dates for x-axis labels (first point is "Start")
        const labels = equityData.map(function (_, i) {
            if (i === 0) return 'Start';
            var d = closedDates[i - 1];
            if (d) {
                // Format YYYY-MM-DD → "Mar 17" style
                var parts = d.split('-');
                if (parts.length === 3) {
                    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10);
                }
            }
            return '#' + i;
        });

        if (equityChart) {
            equityChart.destroy();
            equityChart = null;
        }

        const isPositive = equityData[equityData.length - 1] >= 0;
        const lineColor = isPositive ? '#22c55e' : '#ef4444';

        // Create gradient fill
        var ctx2d = canvas.getContext('2d');
        var gradient = ctx2d.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 280);
        if (isPositive) {
            gradient.addColorStop(0, 'rgba(34, 197, 94, 0.2)');
            gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.05)');
            gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
        } else {
            gradient.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
            gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.05)');
            gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
        }

        equityChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Equity',
                    data: equityData,
                    borderColor: lineColor,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.35,
                    pointRadius: equityData.length > 20 ? 0 : 4,
                    pointHoverRadius: 7,
                    pointBackgroundColor: lineColor,
                    pointBorderColor: '#0d0d22',
                    pointBorderWidth: 2,
                    pointHoverBorderWidth: 3,
                    borderWidth: 2.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 800, easing: 'easeOutQuart' },
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                        ticks: { color: '#5a5a78', maxTicksLimit: 10, font: { size: 11 } }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                        ticks: {
                            color: '#9898b0',
                            callback: function (v) { return '$' + v; },
                            font: { size: 11 }
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(13, 13, 34, 0.9)',
                        borderColor: 'rgba(124, 92, 252, 0.2)',
                        borderWidth: 1,
                        titleColor: '#ededff',
                        bodyColor: '#a0a0c0',
                        cornerRadius: 10,
                        padding: 12,
                        callbacks: {
                            label: function (ctx) { return 'Equity: $' + ctx.parsed.y.toFixed(2); }
                        }
                    }
                }
            }
        });
    }

    function renderTable(trades) {
        const tbody = el('trades-tbody');
        const table = el('trades-table');
        const empty = el('trades-empty');
        const tableContainer = table ? table.closest('.table-container') : null;

        if (!trades.length) {
            if (tableContainer) tableContainer.style.display = 'none';
            empty.style.display = '';
            tbody.innerHTML = '';
            return;
        }

        if (tableContainer) tableContainer.style.display = '';
        empty.style.display = 'none';

        const sorted = trades.slice().sort(function (a, b) {
            if (a.date > b.date) return -1;
            if (a.date < b.date) return 1;
            if (a.createdAt > b.createdAt) return -1;
            if (a.createdAt < b.createdAt) return 1;
            return 0;
        });

        let html = '';
        for (let i = 0; i < sorted.length; i++) {
            const t = sorted[i];
            const isMissed = t.status === 'missed';
            const pnl = isMissed ? null : calcPnL(t);
            const missedPnl = isMissed ? calcMissedPnL(t) : null;
            const pips = isMissed ? null : calcPips(t);
            const pCls = isMissed ? '' : pnlClass(pnl);
            const displayDate = typeof App !== 'undefined' && App.formatDate
                ? App.formatDate(t.date) : t.date;

            const pipsStr = pips !== null
                ? '<span class="trade-pips ' + (pips >= 0 ? 'pips-positive' : 'pips-negative') + '">'
                  + (pips >= 0 ? '+' : '') + pips + ' pips</span>'
                : '';

            // For missed trades, show potential P&L
            let pnlCell = '';
            if (isMissed) {
                pnlCell = '<div class="potential-pnl">' + (missedPnl !== null ? formatPnL(missedPnl) : '--') + '</div>'
                        + '<div class="potential-pnl">potential</div>';
            } else {
                pnlCell = '<div>' + formatPnL(pnl) + '</div>' + pipsStr;
            }

            const plannedRR = calcPlannedRR(t);
            const actualRR = calcActualRR(t);
            const plannedRRStr = plannedRR !== null ? '1:' + plannedRR.toFixed(2) : '--';
            // Actual R:R as R-multiple (e.g. +2.00R, -0.50R, -1.00R = hit SL)
            const actualRRStr = actualRR !== null ? (actualRR >= 0 ? '+' : '') + actualRR.toFixed(2) + 'R' : '--';

            html += '<tr class="' + (isMissed ? 'trade-row-missed' : '') + '">'
                + '<td>' + escapeHTML(displayDate) + '</td>'
                + '<td><strong>' + escapeHTML(t.ticker) + '</strong></td>'
                + '<td><span class="trade-type-' + t.type + '">' + t.type + '</span></td>'
                + '<td><span class="trade-status-' + t.status + '">' + t.status + '</span></td>'
                + '<td class="td-mono">' + formatPrice(t.entryPrice) + '</td>'
                + '<td class="td-mono td-sl">' + (t.slPrice != null ? formatPrice(t.slPrice) : '--') + '</td>'
                + '<td class="td-mono td-tp">' + (t.tpPrice != null ? formatPrice(t.tpPrice) : '--') + '</td>'
                + '<td class="td-mono">' + (t.exitPrice != null ? formatPrice(t.exitPrice) : '--') + '</td>'
                + '<td>' + t.quantity + '</td>'
                + '<td class="td-rr">' + plannedRRStr + '</td>'
                + '<td class="td-rr ' + (actualRR !== null ? (actualRR > 0 ? 'pnl-positive' : actualRR < 0 ? 'pnl-negative' : '') : '') + '">' + actualRRStr + '</td>'
                + '<td class="' + pCls + '">'
                +     pnlCell
                + '</td>'
                + '<td class="td-actions">'
                + '<button class="btn-icon" data-action="edit" data-id="' + t.id + '" title="Edit">'
                + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
                + '</button>'
                + '<button class="btn-icon" data-action="delete" data-id="' + t.id + '" title="Delete">'
                + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
                + '</button>'
                + '</td>'
                + '</tr>';
        }
        tbody.innerHTML = html;
    }

    function render() {
        const trades = loadTrades();
        renderStats(trades);
        renderTable(trades);
    }

    // ── Modal / Form ──────────────────────────────────────────────────

    function resetForm() {
        const form = el('trade-form');
        if (form) form.reset();
        el('trade-id').value = '';
        el('trade-date').value = todayISO();
        el('trade-type').value = 'long';
        el('trade-status').value = 'closed';
        el('trade-entry').value = '';
        el('trade-exit').value = '';
        el('trade-exit').disabled = false;
        el('trade-sl').value = '';
        el('trade-tp').value = '';
        el('trade-quantity').value = '';
        el('trade-lot-size').value = '100000';
        el('trade-fees').value = '0';
        el('trade-notes').value = '';
        el('trade-ticker').value = '';
        el('trade-modal-title').textContent = 'Add Trade';
    }

    function openAddModal() {
        resetForm();
        App.showModal('trade-modal');
    }

    function openEditModal(id) {
        const trades = loadTrades();
        const trade = trades.find(t => t.id === id);
        if (!trade) return;

        resetForm();
        el('trade-modal-title').textContent = 'Edit Trade';
        el('trade-id').value = trade.id;
        el('trade-date').value = trade.date;
        el('trade-ticker').value = trade.ticker;
        el('trade-type').value = trade.type;
        el('trade-status').value = trade.status;
        el('trade-entry').value = trade.entryPrice;
        el('trade-sl').value = trade.slPrice != null ? trade.slPrice : '';
        el('trade-tp').value = trade.tpPrice != null ? trade.tpPrice : '';
        el('trade-lot-size').value = String(trade.lotSize || 100000);

        if (trade.status === 'closed' || trade.status === 'missed') {
            el('trade-exit').disabled = false;
            el('trade-exit').value = trade.exitPrice != null ? trade.exitPrice : '';
        } else {
            el('trade-exit').disabled = true;
            el('trade-exit').value = '';
        }
        el('trade-quantity').value = trade.quantity;
        el('trade-fees').value = trade.fees;
        el('trade-notes').value = trade.notes || '';

        App.showModal('trade-modal');
    }

    function handleStatusChange() {
        const exitField = el('trade-exit');
        if (el('trade-status').value === 'open') {
            exitField.value = '';
            exitField.disabled = true;
        } else {
            exitField.disabled = false;
        }
    }

    /**
     * Calculate P&L for a missed trade (what you would have made/lost).
     * Same math as calcPnL but works on missed status.
     */
    function calcMissedPnL(trade) {
        if (trade.status !== 'missed' || trade.exitPrice == null) return null;
        const lotSize = trade.lotSize || 1;
        const diff = trade.type === 'long'
            ? trade.exitPrice - trade.entryPrice
            : trade.entryPrice - trade.exitPrice;
        return diff * trade.quantity * lotSize - (trade.fees || 0);
    }

    function handleFormSubmit(e) {
        e.preventDefault();

        const id = el('trade-id').value;
        const date = el('trade-date').value.trim();
        const ticker = el('trade-ticker').value.trim().toUpperCase();
        const type = el('trade-type').value;
        const status = el('trade-status').value;
        const entryPrice = parseFloat(el('trade-entry').value);
        const exitRaw = el('trade-exit').value.trim();
        const exitPrice = ((status === 'closed' || status === 'missed') && exitRaw !== '') ? parseFloat(exitRaw) : null;
        const slRaw = el('trade-sl').value.trim();
        const slPrice = slRaw !== '' ? parseFloat(slRaw) : null;
        const tpRaw = el('trade-tp').value.trim();
        const tpPrice = tpRaw !== '' ? parseFloat(tpRaw) : null;
        const quantity = parseFloat(el('trade-quantity').value);
        const lotSize = parseInt(el('trade-lot-size').value, 10) || 100000;
        const fees = parseFloat(el('trade-fees').value) || 0;
        const notes = el('trade-notes').value.trim();

        // Validation
        if (!date) { App.toast('Please enter a date.', 'error'); return; }
        if (!ticker) { App.toast('Please enter a pair symbol.', 'error'); return; }
        if (isNaN(entryPrice) || entryPrice <= 0) { App.toast('Please enter a valid entry price.', 'error'); return; }
        if ((status === 'closed' || status === 'missed') && (exitPrice === null || isNaN(exitPrice) || exitPrice <= 0)) {
            App.toast('Please enter a valid exit price for a ' + status + ' trade.', 'error'); return;
        }
        if (isNaN(quantity) || quantity <= 0) { App.toast('Please enter valid lots.', 'error'); return; }
        if (isNaN(fees) || fees < 0) { App.toast('Fees cannot be negative.', 'error'); return; }

        const trades = loadTrades();
        const isEdit = !!id;

        if (isEdit) {
            const trade = trades.find(t => t.id === id);
            if (trade) {
                Object.assign(trade, {
                    date, ticker, type, status, entryPrice, exitPrice,
                    slPrice, tpPrice, quantity, lotSize, fees, notes
                });
            }
            App.toast('Trade updated.', 'success');
        } else {
            trades.push({
                id: App.generateId(), date, ticker, type, status,
                entryPrice, exitPrice, slPrice, tpPrice,
                quantity, lotSize, fees, notes,
                createdAt: new Date().toISOString()
            });
            App.toast('Trade added.', 'success');
        }

        saveTrades(trades);
        App.closeModal('trade-modal');
        render();
    }

    function deleteTrade(id) {
        if (!confirm('Delete this trade?')) return;
        const trades = loadTrades().filter(t => t.id !== id);
        saveTrades(trades);
        App.toast('Trade deleted.', 'success');
        render();
    }

    // ── Event Binding ─────────────────────────────────────────────────

    function bindEvents() {
        const addBtn = el('add-trade-btn');
        if (addBtn) addBtn.addEventListener('click', openAddModal);

        const form = el('trade-form');
        if (form) form.addEventListener('submit', handleFormSubmit);

        const statusField = el('trade-status');
        if (statusField) statusField.addEventListener('change', handleStatusChange);

        const tbody = el('trades-tbody');
        if (tbody) {
            tbody.addEventListener('click', function (e) {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.getAttribute('data-action');
                const tradeId = btn.getAttribute('data-id');
                if (action === 'edit') openEditModal(tradeId);
                else if (action === 'delete') deleteTrade(tradeId);
            });
        }
    }

    // ── Init ──────────────────────────────────────────────────────────

    function init() {
        bindEvents();
        render();

    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init, render, loadTrades, saveTrades, calcPnL, calcStats };
})();
