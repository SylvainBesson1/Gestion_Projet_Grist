/* -------------------------------------------------
   CONSTANTES & VARIABLES GLOBALES
------------------------------------------------- */
const PRIORITY_LABELS = { 'Élevée': 'Élevée', 'Moyenne': 'Moyenne', 'Basse': 'Basse' };
const PRIORITY_COLORS = { 'Élevée': '#ef4444', 'Moyenne': '#f59e0b', 'Basse': '#3b82f6' };
const DEFAULT_ETAT_COLORS = ['#7c2d12', '#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];

let options = null; // Initialisé à null pour éviter les erreurs
let schema = null;
let taches = [];
let projets = [];
let accompagnateurs = [];
let activites = [];
let columns = [];
let selectedTaskId = null;
let sortableInstances = [];
let groupBy = 'etat';
let searchQuery = '';
let filters = { projet: null, priorite: null, etat: null, folder: null };
let selectedPriority = 'Basse';
let selectedType = null;
let selectedAssignees = [];
let selectedProjetId = null;
let collapsedColumns = { '✅ Terminé': true, '❌ Sans suite': true };
let gristReady = false;
let ETAT_CONFIG = {};
let TYPE_CONFIG = {};

/* -------------------------------------------------
   UTILITAIRES GÉNÉRAUX
------------------------------------------------- */
function escapeHtml(txt) {
  if (!txt) return '';
  const d = document.createElement('div');
  d.textContent = txt;
  return d.innerHTML;
}

function gristToDate(ts) {
  return ts ? new Date(Number(ts) * 1000) : null;
}

function dateToGrist(d) {
  return d ? Math.floor(d.getTime() / 1000) : null;
}

function formatDateShort(d) {
  return d ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(d) : '-';
}

function formatDateInput(d) {
  return d ? d.toISOString().split('T')[0] : '';
}

function getTaskPriority(t) {
  return t[options?.priorityCol] || 'Basse'; // Utilisation de l'opérateur optionnel pour éviter les erreurs
}

function getAssigneesArray(t) {
  if (!t?.[options?.assigneeCol]) return [];
  const assignees = t[options.assigneeCol];
  if (Array.isArray(assignees)) {
    return assignees.filter(i => i !== 'L').map(Number);
  }
  return String(assignees).split(',').map(v => v.trim()).filter(v => v && v !== 'L').map(Number);
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function convertGristToRecords(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const cols = Object.keys(data);
  const n = data[cols[0]]?.length || 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const rec = {};
    cols.forEach(c => rec[c] = data[c][i]);
    out.push(rec);
  }
  return out;
}

/* -------------------------------------------------
   DYNAMIC CONFIGURATIONS (états & types)
------------------------------------------------- */
function buildDynamicConfigs() {
  if (!schema || !options?.table) return;
  const table = schema.tables[options.table];
  if (!table) return;

  // États
  const etatCol = table.columns.find(c => c.id === options.statusCol);
  if (etatCol?.widgetOptions?.choices) {
    ETAT_CONFIG = {};
    etatCol.widgetOptions.choices.forEach((val, i) => {
      const color = etatCol.widgetOptions.choiceColors?.[i] || DEFAULT_ETAT_COLORS[i % DEFAULT_ETAT_COLORS.length];
      ETAT_CONFIG[val] = { label: val, color, order: i + 1 };
    });
  } else {
    ETAT_CONFIG = {
      '🌱 Non débuté': { label: '🌱 Non débuté', color: '#7c2d12', order: 1 },
      '🖐️ À faire': { label: '🖐️ À faire', color: '#ef4444', order: 2 },
      '♻️ En cours': { label: '♻️ En cours', color: '#3b82f6', order: 3 },
      '⏳ En attente': { label: '⏳ En attente', color: '#f59e0b', order: 4 },
      '✅ Terminé': { label: '✅ Terminé', color: '#10b981', order: 5 },
      '❌ Sans suite': { label: '❌ Sans suite', color: '#8b5cf6', order: 6 }
    };
  }

  // Types
  const typeCol = table.columns.find(c => c.id === options.typeCol);
  if (typeCol?.widgetOptions?.choices) {
    TYPE_CONFIG = {};
    typeCol.widgetOptions.choices.forEach(val => {
      TYPE_CONFIG[val] = { label: val };
    });
  } else {
    TYPE_CONFIG = {
      '📋 Mise en œuvre': { label: '📋 Mise en œuvre' },
      '👥 Réunion': { label: '👥 Réunion' },
      '📊 Présentation': { label: '📊 Présentation' },
      '🎓 Formation': { label: '🎓 Formation' },
      '🔍 Veille': { label: '🔍 Veille' },
      '📞 Contact': { label: '📞 Contact' },
      '📖 Relecture': { label: '📖 Relecture' }
    };
  }
}

/* -------------------------------------------------
   CHARGEMENT / GESTION DE SCHEMA
------------------------------------------------- */
async function loadSchema() {
  try {
    schema = await grist.docApi.getSchema();
    console.log("Schéma chargé :", schema);
    buildDynamicConfigs();
  } catch (e) {
    console.warn('Schéma indisponible', e);
  }
}

/* -------------------------------------------------
   COLONNES KANBAN (group-by)
------------------------------------------------- */
function changeGroupBy(v) {
  groupBy = v;
  localStorage.setItem('msh_kanban_groupby', v);
  buildColumns();
  render();
}

function buildColumns() {
  columns = [];
  if (groupBy === 'etat') {
    Object.entries(ETAT_CONFIG).forEach(([id, cfg]) => {
      columns.push({ id, label: cfg.label, color: cfg.color, order: cfg.order });
    });
    columns.sort((a, b) => a.order - b.order);
  } else {
    ['Élevée', 'Moyenne', 'Basse'].forEach(p => {
      columns.push({
        id: p,
        label: PRIORITY_LABELS[p],
        color: PRIORITY_COLORS[p],
        order: ['Élevée', 'Moyenne', 'Basse'].indexOf(p) + 1
      });
    });
  }
}

function getTaskColumnValue(t) {
  return groupBy === 'etat' ? (t[options.statusCol] || '🖐️ À faire') : getTaskPriority(t);
}

/* -------------------------------------------------
   FILTRES / RECHERCHE
------------------------------------------------- */
function populateProjetSelect() {
  updateProjetDropdown();
}

function loadFilters() {
  try {
    const stored = localStorage.getItem('msh_kanban_filters');
    if (stored) filters = JSON.parse(stored);
    const storedGroup = localStorage.getItem('msh_kanban_groupby');
    if (storedGroup) {
      groupBy = storedGroup;
      document.getElementById('groupBySelect').value = groupBy;
    }
  } catch (e) {
    console.error('Erreur lecture filtres', e);
  }
}

function saveFilters() {
  localStorage.setItem('msh_kanban_filters', JSON.stringify(filters));
}

function toggleFilterMenu(id) {
  const menu = document.querySelector(`#${id} .filter-menu`);
  const wasOpen = menu.classList.contains('open');
  document.querySelectorAll('.filter-menu').forEach(m => m.classList.remove('open'));
  if (!wasOpen) menu.classList.add('open');
}

function setFilter(k, v) {
  filters[k] = v;
  saveFilters();
  updateFilterUI();
  render();
}

function updateFilterMenus() {
  if (!options?.projectTable || !options?.projectNameCol) return;

  // Projets
  const projets = activites.filter(a => a[options.projectNameCol] && a.id);
  projets.sort((a, b) => a[options.projectNameCol].localeCompare(b[options.projectNameCol]));
  document.getElementById('filterProjetMenu').innerHTML = `
    <div class="filter-menu-header">Projets</div>
    <div class="filter-option ${!filters.projet ? 'active' : ''}" onclick="setFilter('projet', null)">Tous les projets</div>
    ${projets.map(p => `
      <div class="filter-option ${filters.projet == p.id ? 'active' : ''}" onclick="setFilter('projet', ${p.id})">
        ${escapeHtml(p[options.projectNameCol])}
      </div>`).join('')}
  `;

  // Priorités
  document.getElementById('filterPrioriteMenu').innerHTML = `
    <div class="filter-menu-header">Priorité</div>
    <div class="filter-option ${!filters.priorite ? 'active' : ''}" onclick="setFilter('priorite', null)">Toutes</div>
    ${['Élevée', 'Moyenne', 'Basse'].map(p => `
      <div class="filter-option ${filters.priorite === p ? 'active' : ''}" onclick="setFilter('priorite', '${p}')">
        <span class="color-dot" style="background:${PRIORITY_COLORS[p]}"></span>
        ${PRIORITY_LABELS[p]}
      </div>`).join('')}
  `;

  // États
  const etatOpts = Object.values(ETAT_CONFIG);
  document.getElementById('filterEtatMenu').innerHTML = `
    <div class="filter-menu-header">État</div>
    <div class="filter-option ${!filters.etat ? 'active' : ''}" onclick="setFilter('etat', null)">Tous les états</div>
    ${etatOpts.map(cfg => `
      <div class="filter-option ${filters.etat === cfg.label ? 'active' : ''}" onclick="setFilter('etat', '${cfg.label}')">
        <span class="color-dot" style="background:${cfg.color}"></span>
        ${cfg.label}
      </div>`).join('')}
  `;

  // Dossiers (si configuré)
  if (options?.folderCol) {
    const folders = [...new Set(taches.map(t => t[options.folderCol]))].filter(f => f);
    document.getElementById('filterFolderMenu').innerHTML = `
      <div class="filter-menu-header">Dossiers</div>
      <div class="filter-option ${!filters.folder ? 'active' : ''}" onclick="setFilter('folder', null)">Tous</div>
      ${folders.map(f => `
        <div class="filter-option ${filters.folder === f ? 'active' : ''}" onclick="setFilter('folder', '${f}')">
          ${escapeHtml(f)}
        </div>`).join('')}
    `;
  }
}

function updateFilterUI() {
  const projBtn = document.querySelector('#filterProjet .filter-btn');
  const prioBtn = document.querySelector('#filterPriorite .filter-btn');
  const etatBtn = document.querySelector('#filterEtat .filter-btn');
  const folderBtn = document.querySelector('#filterFolder .filter-btn');

  if (projBtn) projBtn.className = 'filter-btn' + (filters.projet ? ' active' : '');
  if (prioBtn) prioBtn.className = 'filter-btn' + (filters.priorite ? ' active' : '');
  if (etatBtn) etatBtn.className = 'filter-btn' + (filters.etat ? ' active' : '');
  if (folderBtn) folderBtn.className = 'filter-btn' + (filters.folder ? ' active' : '');

  const proj = activites.find(a => a.id == filters.projet);
  if (projBtn && options?.projectNameCol) {
    document.getElementById('filterProjetLabel').textContent =
      filters.projet ? `Projet: ${proj ? escapeHtml(proj[options.projectNameCol]) : 'Inconnu'}` : 'Projet ▾';
  }

  if (prioBtn) {
    document.getElementById('filterPrioriteLabel').textContent =
      filters.priorite ? PRIORITY_LABELS[filters.priorite] : 'Priorité ▾';
  }

  if (etatBtn) {
    document.getElementById('filterEtatLabel').textContent =
      filters.etat ? filters.etat : 'État ▾';
  }

  if (folderBtn && options?.folderCol) {
    document.getElementById('filterFolderLabel').textContent =
      filters.folder ? `Dossier: ${escapeHtml(filters.folder)}` : 'Dossier ▾';
  }

  const chips = [];
  if (filters.projet && options?.projectNameCol) {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
    const proj = activites.find(a => a.id == filters.projet);
    const col = proj?.couleur || colors[activites.indexOf(proj) % colors.length];
    chips.push(`<span class="filter-chip" style="border-left:3px solid ${col}" title="${proj ? escapeHtml(proj[options.projectNameCol]) : ''}">
      ${proj ? escapeHtml(proj[options.projectNameCol].length > 15 ? proj[options.projectNameCol].substring(0, 15) + '…' : proj[options.projectNameCol]) : 'Inconnu'}
      <button onclick="setFilter('projet', null)">×</button></span>`);
  }

  if (filters.priorite) chips.push(`<span class="filter-chip">${PRIORITY_LABELS[filters.priorite]} <button onclick="setFilter('priorite', null)">×</button></span>`);
  if (filters.etat) chips.push(`<span class="filter-chip">${filters.etat} <button onclick="setFilter('etat', null)">×</button></span>`);
  if (filters.folder) chips.push(`<span class="filter-chip">${escapeHtml(filters.folder)} <button onclick="setFilter('folder', null)">×</button></span>`);

  document.getElementById('activeFilters').innerHTML = chips.join('');
}

let _searchTimer;
function handleSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
    render();
  }, 300);
}

function getFilteredTasks() {
  if (!taches) return [];

  return taches.filter(task => {
    // Filtre par dossier
    if (filters.folder && task[options.folderCol] !== filters.folder) return false;
    // Filtre par projet
    if (filters.projet && task[options.projectCol] !== filters.projet) return false;
    // Filtre par priorité
    if (filters.priorite && getTaskPriority(task) !== filters.priorite) return false;
    // Filtre par état
    if (filters.etat && task[options.statusCol] !== filters.etat) return false;
    // Filtre par recherche texte
    if (searchQuery) {
      const t = (task[options.titleCol] || '').toLowerCase();
      const d = (task[options.descCol] || '').toLowerCase();
      if (!t.includes(searchQuery) && !d.includes(searchQuery)) return false;
    }
    return true;
  });
}

/* -------------------------------------------------
   RENDERING KANBAN
------------------------------------------------- */
function render() {
  if (!options || !columns.length) return;

  const cont = document.getElementById('kanbanContainer');
  const filtered = getFilteredTasks();
  let html = '';

  columns.forEach(col => {
    let colTasks = filtered.filter(t => getTaskColumnValue(t) === col.id);
    if (groupBy === 'priorite') {
      colTasks = colTasks.filter(t => t[options.statusCol] !== '✅ Terminé' && t[options.statusCol] !== '❌ Sans suite');
    }
    const isVerticallyCollapsed = collapsedColumns[col.id] || false;

    html += `
    <div class="kanban-column${isVerticallyCollapsed ? ' vertical-collapsed' : ''}" data-column-id="${col.id}">
      <div class="column-header" style="${isVerticallyCollapsed ? `background-color: ${col.color};` : ''}">
        <span class="column-title">
          <span class="column-dot" style="background:${col.color}"></span>
          ${escapeHtml(col.label)}
        </span>
        ${!isVerticallyCollapsed ? `<span class="column-count">${colTasks.length}</span>` : ''}
        <button class="expand-btn" onclick="toggleColumnCollapse('${col.id}')" style="${isVerticallyCollapsed ? 'color: white;' : ''}">
          ⇄
        </button>
      </div>
      <div class="column-body" data-column="${col.id}">
        ${colTasks.length === 0 ? '<div class="empty-column">Aucune tâche</div>' : ''}
        ${colTasks.map(renderTaskCard).join('')}
      </div>
      ${!isVerticallyCollapsed ?
        `<div class="column-footer">
          <button class="add-task-btn" data-column-id="${col.id}" onclick="openCreateModal('${col.id}')">
            + Ajouter une tâche
          </button>
        </div>` : ''}
    </div>`;
  });

  cont.innerHTML = html;

  // Initialiser SortableJS pour le drag & drop
  sortableInstances.forEach(s => s.destroy());
  sortableInstances = [];
  document.querySelectorAll('.column-body').forEach(body => {
    const s = Sortable.create(body, {
      group: 'kanban',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      filter: '.empty-column',
      preventOnFilter: false,
      onEnd: handleDragEnd,
      delay: 100,
      delayOnTouchOnly: true
    });
    sortableInstances.push(s);
  });

  // Ajouter des écouteurs d'événements aux cartes de tâche
  document.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', e => { e.stopPropagation(); selectTask(parseInt(card.dataset.id)); });
    card.addEventListener('dblclick', e => { e.stopPropagation(); openEditModal(parseInt(card.dataset.id)); });
  });
}

function renderTaskCard(task) {
  if (!options) return '';

  const priority = getTaskPriority(task);
  const deadline = gristToDate(task[options.dateCol]);
  const selected = task.id === selectedTaskId ? ' selected' : '';
  const assignees = getAssigneesArray(task);
  const isDeadlineOverdue = deadline && new Date() > deadline;

  let borderColor = '#ccc';
  if (groupBy === 'etat') {
    const cfg = ETAT_CONFIG[task[options.statusCol]];
    if (cfg) borderColor = cfg.color;
  } else {
    borderColor = PRIORITY_COLORS[priority];
  }

  let badges = '';

  // Afficher le badge de priorité uniquement si on ne groupe pas par priorité
  if (groupBy !== 'priorite') {
    badges += `<span class="badge priority ${priority === 'Élevée' ? 'p1' : priority === 'Moyenne' ? 'p2' : 'p3'}">${priority}</span>`;
  }

  if (task[options.projectCol]) {
    const projName = getProjectNameFromId(task[options.projectCol]);
    if (projName) {
      const short = projName.length > 10 ? projName.substring(0, 10) + '…' : projName;
      badges += `<span class="badge project" title="${escapeHtml(projName)}">${escapeHtml(short)}</span>`;
    }
  }

  // Afficher le badge d'état uniquement si on ne groupe pas par état
  if (groupBy !== 'etat' && task[options.statusCol] && ETAT_CONFIG[task[options.statusCol]]) {
    const cfg = ETAT_CONFIG[task[options.statusCol]];
    badges += `<span class="badge etat" style="background-color:${cfg.color}">${escapeHtml(task[options.statusCol])}</span>`;
  }

  if (task[options.typeCol]) {
    badges += `<span class="badge type">${escapeHtml(task[options.typeCol])}</span>`;
  }

  let assigneeHtml = '';
  if (assignees.length) {
    assigneeHtml = '<div class="task-card-assignees">';
    assignees.slice(0, 3).forEach(id => {
      const mem = accompagnateurs.find(m => m.id === id);
      if (mem) {
        assigneeHtml += `<div class="assignee-avatar" title="${escapeHtml(mem[options.assigneeNameCol])}">${getInitials(mem[options.assigneeNameCol])}</div>`;
      }
    });
    if (assignees.length > 3) {
      assigneeHtml += `<div class="assignee-avatar" title="${assignees.length - 3} autres">+${assignees.length - 3}</div>`;
    }
    assigneeHtml += '</div>';
  }

  const deadlineDateText = formatDateShort(deadline);
  const deadlineClass = isDeadlineOverdue ? 'overdue' : '';

  return `
  <div class="task-card${selected}" style="border-left-color:${borderColor}" data-id="${task.id}">
    <div class="task-card-title">${escapeHtml(task[options.titleCol])}</div>
    <div class="task-card-badges">${badges}</div>
    <div class="task-card-meta">
      <span class="task-card-date ${deadlineClass}" title="${deadline ? deadline.toLocaleDateString('fr-FR') : ''}">
        📅 ${deadlineDateText}
      </span>
      ${assigneeHtml}
    </div>
  </div>`;
}

/* -------------------------------------------------
   DRAG & DROP
------------------------------------------------- */
async function handleDragEnd(evt) {
  const taskId = parseInt(evt.item.dataset.id);
  const newCol = evt.to.dataset.column;
  const task = taches.find(t => t.id === taskId);
  if (!task) return;

  if (newCol === '✅ Terminé') {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });
  }

  if (groupBy === 'etat') {
    task[options.statusCol] = newCol;
  } else if (groupBy === 'priorite') {
    task[options.priorityCol] = newCol;
  }

  try {
    const upd = groupBy === 'etat' ? { [options.statusCol]: newCol } : { [options.priorityCol]: newCol };
    await grist.docApi.applyUserActions([['UpdateRecord', options.table, taskId, upd]]);
    showToast('✓ Tâche mise à jour', 'success');
    await loadAllData();
  } catch (e) {
    console.error(e);
    showToast('Erreur de mise à jour', 'error');
  }
}

/* -------------------------------------------------
   SÉLECTION DE TÂCHE
------------------------------------------------- */
function selectTask(id) {
  selectedTaskId = id;
  document.querySelectorAll('.task-card')
    .forEach(c => c.classList.toggle('selected', parseInt(c.dataset.id) === id));
  if (gristReady && id) grist.setSelectedRows([id]);
}

/* -------------------------------------------------
   MODAL – création / édition
------------------------------------------------- */
function openCreateModal(columnId = null) {
  if (!options) {
    showToast("Les options ne sont pas encore chargées.", "error");
    return;
  }

  document.getElementById('taskId').value = '';
  document.getElementById('modalTitle').innerHTML = '<span>✏️</span> Nouvelle tâche';
  document.getElementById('taskNom').value = '';
  document.getElementById('taskDescription').value = '';
  document.getElementById('taskDebut').value = formatDateInput(new Date());
  document.getElementById('taskDeadline').value = '';
  populateEtatSelect();
  updateProjetDropdown();
  buildTypeSelector();

  if (columnId !== null) {
    if (groupBy === 'etat') document.getElementById('taskEtat').value = columnId;
    else if (groupBy === 'priorite') selectPriority(columnId);
  } else {
    document.getElementById('taskEtat').value = '🖐️ À faire';
    selectPriority('Basse');
  }

  selectPriority(selectedPriority);
  const firstType = Object.keys(TYPE_CONFIG)[0] || 'Mise en œuvre';
  selectType(selectedType || firstType);
  selectedAssignees = [];
  selectedProjetId = null;
  const projetValues = document.getElementById('projetValues');
  if (projetValues) {
    projetValues.innerHTML = '<span style="color:var(--text-muted)">Sélectionner un projet…</span>';
  }
  updateAssigneeDisplay();
  updateAssigneeDropdown();
  document.getElementById('deleteTaskBtn').style.display = 'none';
  document.getElementById('taskModal').classList.add('open');
  document.getElementById('taskNom').focus();
}

function openEditModal(taskId) {
  if (!options) {
    showToast("Les options ne sont pas encore chargées.", "error");
    return;
  }

  const task = taches.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('taskId').value = task.id;
  document.getElementById('modalTitle').innerHTML = '<span>📝</span> Modifier la tâche';
  document.getElementById('taskNom').value = task[options.titleCol] || '';
  document.getElementById('taskDescription').value = task[options.descCol] || '';

  // Mise à jour de l'affichage du projet sélectionné
  selectedProjetId = task[options.projectCol];
  const projetValues = document.getElementById('projetValues');
  if (projetValues) {
    const projet = activites.find(a => a.id === task[options.projectCol]);
    if (projet) {
      projetValues.innerHTML = `<span class="filter-chip">${escapeHtml(projet[options.projectNameCol])}</span>`;
    }
  }

  const debut = gristToDate(task[options.startDateCol]);
  const deadline = gristToDate(task[options.dateCol]);
  document.getElementById('taskDebut').value = debut ? formatDateInput(debut) : '';
  document.getElementById('taskDeadline').value = deadline ? formatDateInput(deadline) : '';

  populateEtatSelect();
  updateProjetDropdown();
  buildTypeSelector();

  document.getElementById('taskEtat').value = task[options.statusCol] || '🖐️ À faire';
  selectPriority(getTaskPriority(task));

  let storedKey = task[options.typeCol];
  if (TYPE_CONFIG[storedKey] === undefined) {
    const found = Object.entries(TYPE_CONFIG).find(([, v]) => v.label === storedKey);
    storedKey = found ? found[0] : storedKey;
  }
  selectedType = storedKey;
  selectType(storedKey);

  selectedAssignees = getAssigneesArray(task);
  updateAssigneeDisplay();
  updateAssigneeDropdown();
  document.getElementById('deleteTaskBtn').style.display = 'inline-flex';
  document.getElementById('taskModal').classList.add('open');
}

function closeModal() {
  document.getElementById('taskModal').classList.remove('open');
}

function selectPriority(p) {
  selectedPriority = p;
  document.querySelectorAll('.priority-option')
    .forEach(o => o.classList.toggle('active', o.dataset.value === p));
}

function selectType(t) {
  selectedType = t;
  document.querySelectorAll('.type-option')
    .forEach(o => o.classList.toggle('active', o.dataset.value === t));
}

function populateEtatSelect() {
  const sel = document.getElementById('taskEtat');
  sel.innerHTML = '';
  Object.values(ETAT_CONFIG).forEach(cfg => {
    const opt = document.createElement('option');
    opt.value = cfg.label;
    opt.textContent = cfg.label;
    sel.appendChild(opt);
  });
}

function buildTypeSelector() {
  const container = document.getElementById('typeSelector');
  container.innerHTML = '';
  Object.entries(TYPE_CONFIG).forEach(([storedVal, info]) => {
    const label = typeof info === 'string' ? info : (info.label || storedVal);
    const div = document.createElement('div');
    div.className = 'type-option' + (selectedType === storedVal ? ' active' : '');
    div.dataset.value = storedVal;
    div.innerHTML = escapeHtml(label);
    div.onclick = () => selectType(storedVal);
    container.appendChild(div);
  });
}

/* -------------------------------------------------
   PROJETS – multi-select avec recherche
------------------------------------------------- */
function toggleMultiSelect(id) {
  document.getElementById(id).classList.toggle('open');
}

function filterProjets() {
  const searchTerm = document.getElementById('searchProjet').value.toLowerCase();
  const projets = activites.filter(a => a[options.projectNameCol] && a.id);
  const filteredProjets = projets.filter(p => p[options.projectNameCol].toLowerCase().includes(searchTerm));

  const optionsHTML = filteredProjets.map(p => {
    const isSelected = selectedProjetId === p.id;
    return `
      <div class="multi-select-option ${isSelected ? 'selected' : ''}"
          onclick="selectProjet(${p.id}, '${escapeHtml(p[options.projectNameCol])}')">
          ${escapeHtml(p[options.projectNameCol])}
      </div>
    `;
  }).join('');

  document.getElementById('projetOptions').innerHTML = optionsHTML;
}

function selectProjet(id, nom) {
  selectedProjetId = id;
  const projetValues = document.getElementById('projetValues');
  if (projetValues) {
    projetValues.innerHTML = `<span class="filter-chip">${escapeHtml(nom)}</span>`;
  }
  const projetDropdown = document.getElementById('projetDropdown');
  if (projetDropdown) {
    projetDropdown.classList.remove('open');
  }
  updateProjetDropdown();
}

function updateProjetDropdown() {
  const projetDropdown = document.getElementById('projetDropdown');
  if (!projetDropdown) return;

  const projets = activites.filter(a => a[options.projectNameCol] && a.id);
  projets.sort((a, b) => a[options.projectNameCol].localeCompare(b[options.projectNameCol]));

  const optionsHTML = projets.map(p => {
    const isSelected = selectedProjetId === p.id;
    return `
      <div class="multi-select-option ${isSelected ? 'selected' : ''}"
          onclick="selectProjet(${p.id}, '${escapeHtml(p[options.projectNameCol])}')">
          ${escapeHtml(p[options.projectNameCol])}
      </div>
    `;
  }).join('');

  projetDropdown.innerHTML = `
    <div class="search-container">
      <input type="text" id="searchProjet" placeholder="Rechercher un projet…" oninput="filterProjets()">
    </div>
    <div id="projetOptions">${optionsHTML}</div>
  `;
}

/* -------------------------------------------------
   ASSIGNÉS – multi-select avec recherche
------------------------------------------------- */
function filterAssignes() {
  const searchTerm = document.getElementById('searchAssigne').value.toLowerCase();
  const filteredAssignes = accompagnateurs.filter(a => a[options.assigneeNameCol].toLowerCase().includes(searchTerm));

  const optionsHTML = filteredAssignes.map(m => `
    <div class="multi-select-option ${selectedAssignees.includes(m.id) ? 'selected' : ''}"
         onclick="toggleAssignee(${m.id})">
      <input type="checkbox" ${selectedAssignees.includes(m.id) ? 'checked' : ''}>
      ${escapeHtml(m[options.assigneeNameCol])}
    </div>
  `).join('');

  document.getElementById('assigneOptions').innerHTML = optionsHTML;
}

function toggleAssignee(id) {
  if (selectedAssignees.includes(id)) {
    selectedAssignees = selectedAssignees.filter(a => a !== id);
  } else {
    selectedAssignees.push(id);
  }
  updateAssigneeDisplay();
  updateAssigneeDropdown();
}

function updateAssigneeDisplay() {
  const assigneValues = document.getElementById('assigneValues');
  if (!assigneValues) return;

  if (!selectedAssignees.length) {
    assigneValues.innerHTML = '<span style="color:var(--text-muted)">Sélectionner…</span>';
  } else {
    assigneValues.innerHTML = selectedAssignees.map(id => {
      const mem = accompagnateurs.find(m => m.id === id);
      return mem ? `<span class="filter-chip">${escapeHtml(mem[options.assigneeNameCol])}</span>` : '';
    }).join('');
  }
}

function updateAssigneeDropdown() {
  const assigneDropdown = document.getElementById('assigneDropdown');
  if (!assigneDropdown) return;

  const optionsHTML = accompagnateurs.map(m => `
    <div class="multi-select-option ${selectedAssignees.includes(m.id) ? 'selected' : ''}"
         onclick="toggleAssignee(${m.id})">
      <input type="checkbox" ${selectedAssignees.includes(m.id) ? 'checked' : ''}>
      ${escapeHtml(m[options.assigneeNameCol])}
    </div>
  `).join('');

  assigneDropdown.innerHTML = `
    <div class="search-container">
      <input type="text" id="searchAssigne" placeholder="Rechercher un accompagnateur…" oninput="filterAssignes()">
    </div>
    <div id="assigneOptions">${optionsHTML}</div>
  `;
}

/* -------------------------------------------------
   ENREGISTREMENT / SUPPRESSION
------------------------------------------------- */
async function saveTask() {
  if (!options) {
    showToast("Les options ne sont pas encore chargées.", "error");
    return;
  }

  const id = document.getElementById('taskId').value;
  const name = document.getElementById('taskNom').value.trim();

  if (!name) {
    showToast('⚠️ Le nom est requis', 'warning');
    document.getElementById('taskNom').focus();
    return;
  }

  if (!selectedProjetId) {
    showToast('⚠️ Le projet est requis', 'warning');
    return;
  }

  const projetId = selectedProjetId;
  const debutVal = document.getElementById('taskDebut').value;
  const deadlineVal = document.getElementById('taskDeadline').value;

  const payload = {
    [options.titleCol]: name,
    [options.descCol]: document.getElementById('taskDescription').value || '',
    [options.statusCol]: document.getElementById('taskEtat').value || '🖐️ À faire',
    [options.projectCol]: projetId,
    [options.priorityCol]: selectedPriority,
    [options.typeCol]: selectedType,
    [options.dateCol]: deadlineVal ? dateToGrist(new Date(deadlineVal)) : null,
    [options.startDateCol]: dateToGrist(new Date(debutVal || new Date())),
    [options.assigneeCol]: selectedAssignees.length ? selectedAssignees : null
  };

  try {
    if (id) {
      await grist.docApi.applyUserActions([['UpdateRecord', options.table, Number(id), payload]]);
      showToast('✓ Tâche modifiée', 'success');
    } else {
      await grist.docApi.applyUserActions([['AddRecord', options.table, null, payload]]);
      showToast('✓ Tâche créée', 'success');
    }
    closeModal();
    await loadAllData();
  } catch (e) {
    console.error('Erreur lors de l\'enregistrement:', e);
    showToast(`Erreur lors de l'enregistrement : ${e.message}`, 'error');
  }
}

async function deleteTask() {
  const taskId = document.getElementById('taskId').value;
  if (!taskId) {
    showToast('⚠️ Aucune tâche sélectionnée', 'warning');
    return;
  }
  if (!confirm('Voulez-vous vraiment supprimer cette tâche ?')) return;

  try {
    await grist.docApi.applyUserActions([['UpdateRecord', options.table, Number(taskId), { Supprime: true }]]);
    showToast('✓ Tâche marquée comme supprimée', 'success');
    closeModal();
    await loadAllData();
  } catch (e) {
    console.error(e);
    showToast('Erreur lors de la suppression', 'error');
  }
}

/* -------------------------------------------------
   CHARGEMENT COMPLET (tables + UI)
------------------------------------------------- */
function getProjectNameFromId(id) {
  if (!options?.projectNameCol) return null;
  const p = activites.find(r => r.id === id);
  return p ? p[options.projectNameCol] : null;
}

async function loadAllData() {
  if (!options) return;

  document.getElementById('loadingOverlay').style.display = 'flex';

  try {
    // Charger la table des tâches
    const tachesData = await grist.docApi.fetchTable(options.table);
    taches = convertGristToRecords(tachesData).filter(r => !r.Supprime);

    // Charger la table des accompagnateurs (nom fourni par l'utilisateur)
    const accompagnateursData = await grist.docApi.fetchTable(options.assigneeTable);
    accompagnateurs = convertGristToRecords(accompagnateursData);

    // Charger la table des projets (nom fourni par l'utilisateur)
    const projetsData = await grist.docApi.fetchTable(options.projectTable);
    projets = convertGristToRecords(projetsData);

    // Suite du traitement...
    buildDynamicConfigs();
    buildColumns();
    updateFilterMenus();
    render();
  } catch (e) {
    console.error('Erreur lors du chargement des données:', e);
    showToast(`Erreur de chargement : ${e.message}`, 'error');
  } finally {
    document.getElementById('loadingOverlay').style.display = 'none';
  }
}
// Exemple d'utilisation des colonnes personnalisées
function getAssigneeName(assigneeId) {
  const assignee = accompagnateurs.find(a => a.id === assigneeId);
  return assignee ? assignee[options.assigneeNameCol] : "Inconnu";
}

function getProjectName(projectId) {
  const projet = projets.find(p => p.id === projectId);
  return projet ? projet[options.projectNameCol] : "Inconnu";
}
async function checkAndUpdateOverdueTasks() {
  if (!options?.dateCol || !options?.priorityCol) return;

  const now = new Date();
  let actions = [];

  taches.forEach(task => {
    const deadline = gristToDate(task[options.dateCol]);
    if (deadline && now > deadline && getTaskPriority(task) !== 'Élevée') {
      task[options.priorityCol] = 'Élevée';
      actions.push(['UpdateRecord', options.table, task.id, { [options.priorityCol]: 'Élevée' }]);
    }
  });

  if (actions.length > 0) {
    try {
      await grist.docApi.applyUserActions(actions);
      showToast(`Mise à jour des priorités pour ${actions.length} tâche(s)`, 'success');
    } catch (e) {
      console.error('Erreur lors de la mise à jour des priorités:', e);
      showToast('Erreur lors de la mise à jour des priorités', 'error');
    }
  }
}

/* -------------------------------------------------
   INITIALISATION
------------------------------------------------- */
async function init() {
  try {
    await grist.ready({ requiredAccess: 'full' });

    // Attendre les options
    grist.onOptions((newOptions) => {
      options = newOptions;
      console.log("Options reçues :", options);
      if (options.table) {
        loadSchema().then(loadAllData);
      } else {
        console.error("La table n'est pas définie dans les options.");
      }
    });

    gristReady = true;
    loadFilters();

    grist.onRecords(async () => await loadAllData());
    grist.onRecord(r => {
      if (r?.id && r.id !== selectedTaskId) {
        selectedTaskId = r.id;
        document.querySelectorAll('.task-card')
          .forEach(c => c.classList.toggle('selected', parseInt(c.dataset.id) === selectedTaskId));
      }
    });
  } catch (e) {
    console.error('Erreur fatale : Grist est indisponible', e);
    showToast('❌ Erreur : Impossible de se connecter à Grist. Veuillez vérifier votre connexion.', 'error');
    document.getElementById('loadingOverlay').style.display = 'none';
    document.body.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--danger);">Erreur : Impossible de se connecter à Grist. L\'application ne peut pas fonctionner sans connexion.</div>';
    throw new Error('Grist est requis pour exécuter cette application.');
  }
}

// Écouteurs globaux
document.addEventListener('click', e => {
  if (!e.target.closest('.filter-dropdown')) document.querySelectorAll('.filter-menu').forEach(m => m.classList.remove('open'));
  if (!e.target.closest('.multi-select')) document.querySelectorAll('.multi-select').forEach(m => m.classList.remove('open'));
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if ((e.key === 'n' || (e.metaKey && e.key === 'N')) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
    e.preventDefault();
    openCreateModal();
  }
});

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', init);
