/**
 * Notes.js - Google Keep-style notes module
 * Uses localStorage key "was_notes".
 */
var Notes = (function () {
    'use strict';

    var STORAGE_KEY = 'was_notes';

    var COLORS = [
        { name: 'Default', hex: '#16162a' },
        { name: 'Red',     hex: '#ef4444' },
        { name: 'Orange',  hex: '#f59e0b' },
        { name: 'Green',   hex: '#22c55e' },
        { name: 'Blue',    hex: '#3b82f6' },
        { name: 'Purple',  hex: '#7c5cfc' },
        { name: 'Pink',    hex: '#ec4899' },
        { name: 'Teal',    hex: '#14b8a6' }
    ];

    // SVG icons
    var ICON_PIN = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>';
    var ICON_EDIT = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
    var ICON_DELETE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

    // ── Data access ─────────────────────────────────────────────────────

    function loadNotes() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Notes: failed to load from localStorage', e);
            return [];
        }
    }

    function saveNotes(notes) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
        } catch (e) {
            console.error('Notes: failed to save to localStorage', e);
        }
    }

    // ── Sorting ─────────────────────────────────────────────────────────

    function sortNotes(notes) {
        return notes.slice().sort(function (a, b) {
            // Pinned first
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            // Then by updatedAt descending
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
    }

    // ── Rendering ───────────────────────────────────────────────────────

    function truncateContent(text, maxLen) {
        maxLen = maxLen || 200;
        if (!text) return '';
        if (text.length <= maxLen) return text;
        return text.substring(0, maxLen) + '...';
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function renderNoteCard(note) {
        var color = note.color || COLORS[0].hex;
        var pinBadge = note.pinned
            ? '<svg class="note-pin-badge" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>'
            : '';

        return '<div class="note-card" style="border-left: 3px solid ' + color + '" data-id="' + note.id + '">'
            + '<div class="note-card-header">'
            +     '<span class="note-card-title">' + escapeHtml(note.title || 'Untitled') + '</span>'
            +     pinBadge
            + '</div>'
            + '<div class="note-card-content">' + escapeHtml(truncateContent(note.content)) + '</div>'
            + '<div class="note-card-actions">'
            +     '<button class="btn-icon" data-action="pin" title="Pin/Unpin">' + ICON_PIN + '</button>'
            +     '<button class="btn-icon" data-action="edit" title="Edit">' + ICON_EDIT + '</button>'
            +     '<button class="btn-icon" data-action="delete" title="Delete">' + ICON_DELETE + '</button>'
            + '</div>'
            + '</div>';
    }

    function renderAll(filter) {
        var grid = document.getElementById('notes-grid');
        var empty = document.getElementById('notes-empty');
        if (!grid) return;

        var notes = loadNotes();

        // Apply search filter
        if (filter) {
            var q = filter.toLowerCase();
            notes = notes.filter(function (n) {
                return (n.title && n.title.toLowerCase().indexOf(q) !== -1)
                    || (n.content && n.content.toLowerCase().indexOf(q) !== -1);
            });
        }

        var sorted = sortNotes(notes);

        if (sorted.length === 0) {
            grid.innerHTML = '';
            if (empty) empty.style.display = '';
            return;
        }

        if (empty) empty.style.display = 'none';

        var html = '';
        for (var i = 0; i < sorted.length; i++) {
            html += renderNoteCard(sorted[i]);
        }
        grid.innerHTML = html;
    }

    // ── Color picker ────────────────────────────────────────────────────

    function buildColorPicker() {
        var container = document.getElementById('note-colors');
        if (!container) return;

        container.innerHTML = '';
        for (var i = 0; i < COLORS.length; i++) {
            var div = document.createElement('div');
            div.className = 'color-option' + (i === 0 ? ' selected' : '');
            div.setAttribute('data-color', COLORS[i].hex);
            div.style.backgroundColor = COLORS[i].hex;
            div.title = COLORS[i].name;
            container.appendChild(div);
        }

        container.addEventListener('click', function (e) {
            var option = e.target.closest('.color-option');
            if (!option) return;
            container.querySelectorAll('.color-option').forEach(function (el) {
                el.classList.remove('selected');
            });
            option.classList.add('selected');
        });
    }

    function getSelectedColor() {
        var selected = document.querySelector('#note-colors .color-option.selected');
        return selected ? selected.getAttribute('data-color') : COLORS[0].hex;
    }

    function setSelectedColor(hex) {
        var container = document.getElementById('note-colors');
        if (!container) return;
        container.querySelectorAll('.color-option').forEach(function (el) {
            if (el.getAttribute('data-color') === hex) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
    }

    // ── CRUD operations ─────────────────────────────────────────────────

    function createNote(title, content, color) {
        var notes = loadNotes();
        var now = new Date().toISOString();
        var note = {
            id: App.generateId(),
            title: title || '',
            content: content || '',
            color: color || COLORS[0].hex,
            pinned: false,
            createdAt: now,
            updatedAt: now
        };
        notes.push(note);
        saveNotes(notes);
        return note;
    }

    function updateNote(id, title, content, color) {
        var notes = loadNotes();
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].id === id) {
                notes[i].title = title || '';
                notes[i].content = content || '';
                notes[i].color = color || notes[i].color;
                notes[i].updatedAt = new Date().toISOString();
                break;
            }
        }
        saveNotes(notes);
    }

    function deleteNote(id) {
        var notes = loadNotes();
        notes = notes.filter(function (n) { return n.id !== id; });
        saveNotes(notes);
    }

    function togglePin(id) {
        var notes = loadNotes();
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].id === id) {
                notes[i].pinned = !notes[i].pinned;
                notes[i].updatedAt = new Date().toISOString();
                break;
            }
        }
        saveNotes(notes);
    }

    function getNoteById(id) {
        var notes = loadNotes();
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].id === id) return notes[i];
        }
        return null;
    }

    // ── Word count helper ────────────────────────────────────────────────

    function updateWordCount(text) {
        var el = document.getElementById('note-word-count');
        if (!el) return;
        var str = text || '';
        var words = str.split(/\s+/).filter(function (w) { return w.length > 0; });
        var charCount = str.length;
        el.textContent = words.length + ' words, ' + charCount + ' characters';
    }

    // ── Modal helpers ───────────────────────────────────────────────────

    function openCreateModal() {
        var modalTitle = document.getElementById('note-modal-title');
        var noteId = document.getElementById('note-id');
        var noteTitle = document.getElementById('note-title');
        var noteContent = document.getElementById('note-content');

        if (modalTitle) modalTitle.textContent = 'New Note';
        if (noteId) noteId.value = '';
        if (noteTitle) noteTitle.value = '';
        if (noteContent) noteContent.value = '';

        // Reset word count
        updateWordCount('');

        // Reset color picker to default
        setSelectedColor(COLORS[0].hex);

        App.showModal('note-modal');
    }

    function openEditModal(id) {
        var note = getNoteById(id);
        if (!note) return;

        var modalTitle = document.getElementById('note-modal-title');
        var noteId = document.getElementById('note-id');
        var noteTitle = document.getElementById('note-title');
        var noteContent = document.getElementById('note-content');

        if (modalTitle) modalTitle.textContent = 'Edit Note';
        if (noteId) noteId.value = note.id;
        if (noteTitle) noteTitle.value = note.title;
        if (noteContent) noteContent.value = note.content;

        setSelectedColor(note.color || COLORS[0].hex);

        // Update word count for existing content
        updateWordCount(note.content || '');

        App.showModal('note-modal');
    }

    // ── Event handlers ──────────────────────────────────────────────────

    function handleFormSubmit(e) {
        e.preventDefault();

        var noteId = document.getElementById('note-id');
        var noteTitle = document.getElementById('note-title');
        var noteContent = document.getElementById('note-content');

        var id = noteId ? noteId.value : '';
        var title = noteTitle ? noteTitle.value.trim() : '';
        var content = noteContent ? noteContent.value.trim() : '';
        var color = getSelectedColor();

        if (!title && !content) {
            App.toast('Please enter a title or content', 'error');
            return;
        }

        if (id) {
            updateNote(id, title, content, color);
            App.toast('Note updated', 'success');
        } else {
            createNote(title, content, color);
            App.toast('Note created', 'success');
        }

        App.closeModal('note-modal');
        renderAll(getCurrentSearch());
    }

    function handleGridClick(e) {
        var actionBtn = e.target.closest('[data-action]');
        var card = e.target.closest('.note-card');
        if (!card) return;

        var id = card.getAttribute('data-id');

        if (actionBtn) {
            var action = actionBtn.getAttribute('data-action');
            if (action === 'delete') {
                deleteNote(id);
                App.toast('Note deleted', 'info');
                renderAll(getCurrentSearch());
            } else if (action === 'pin') {
                togglePin(id);
                var note = getNoteById(id);
                App.toast(note && note.pinned ? 'Note pinned' : 'Note unpinned', 'info');
                renderAll(getCurrentSearch());
            } else if (action === 'edit') {
                openEditModal(id);
            }
        } else {
            // Clicking on card body opens edit
            openEditModal(id);
        }
    }

    function getCurrentSearch() {
        var input = document.getElementById('notes-search');
        return input ? input.value.trim() : '';
    }

    function handleSearch() {
        renderAll(getCurrentSearch());
    }

    // ── Initialisation ──────────────────────────────────────────────────

    function init() {
        buildColorPicker();

        // Add note button
        var addBtn = document.getElementById('add-note-btn');
        if (addBtn) {
            addBtn.addEventListener('click', openCreateModal);
        }

        // Form submit
        var form = document.getElementById('note-form');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        // Grid click delegation
        var grid = document.getElementById('notes-grid');
        if (grid) {
            grid.addEventListener('click', handleGridClick);
        }

        // Live word count on textarea
        var noteContentArea = document.getElementById('note-content');
        if (noteContentArea) {
            noteContentArea.addEventListener('input', function () {
                updateWordCount(noteContentArea.value);
            });
        }

        // Search
        var searchInput = document.getElementById('notes-search');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
        }

        // Initial render
        renderAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── Public API ──────────────────────────────────────────────────────

    return {
        render: renderAll,
        create: createNote,
        update: updateNote,
        remove: deleteNote,
        togglePin: togglePin
    };
})();
