// ========== INITIALIZATION ==========
let W;
let T;
let options = null;
let schema = null;
let taches = [];
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

window.addEventListener('load', async (event) => {
    // Création de l'objet WidgetSDK
    W = new WidgetSDK();

    // Chargement des traductions
    T = await W.loadTranslations(['widget.js']);

    // Configuration des options
    W.configureOptions(
        [
            {
                name: 'columns',
                label: 'Comportement des colonnes',
                description: 'Configurez le comportement de chaque colonne.',
                group: 'Colonnes',
                type: 'object',
                template: [
                    WidgetSDK.newItem('addbutton', true, 'Ajouter une carte', 'Si coché, affiche un bouton pour ajouter une carte à la colonne.'),
                    WidgetSDK.newItem('isdone', false, 'Terminé', 'Si coché, les cartes dans cette colonne sont considérées comme terminées.'),
                    WidgetSDK.newItem('useconfetti', false, 'Confettis', 'Si coché, des confettis apparaissent lorsqu\'une carte entre dans cette colonne.')
                ],
                columnId: 'statusCol'
            },
            WidgetSDK.newItem('statusCol', null, 'Colonne de l\'état', 'Colonne contenant l\'état de la tâche.', 'Colonnes', {type: 'column', tableFrom: 'table', required: true}),
            WidgetSDK.newItem('titleCol', null, 'Titre de la tâche', 'Colonne contenant le titre de la tâche.', 'Colonnes', {type: 'column', tableFrom: 'table', required: true}),
            WidgetSDK.newItem('projectRefCol', null, 'Référence du projet', 'Colonne contenant la référence au projet.', 'Colonnes', {type: 'column', tableFrom: 'table', required: true}),
            WidgetSDK.newItem('projectNameCol', 'Nom', 'Nom de la colonne "Nom" dans la référence du projet', 'Nom de la colonne contenant le nom du projet dans la référence.', 'Colonnes'),
            WidgetSDK.newItem('assigneeRefCol', null, 'Référence des accompagnateurs', 'Colonne contenant la référence aux accompagnateurs.', 'Colonnes', {type: 'column', tableFrom: 'table', required: true}),
            WidgetSDK.newItem('assigneeNameCol', 'Nom', 'Nom de la colonne "Nom" dans la référence des accompagnateurs', 'Nom de la colonne contenant le nom des accompagnateurs dans la référence.', 'Colonnes'),
            WidgetSDK.newItem('priorityCol', null, 'Priorité', 'Colonne contenant la priorité de la tâche.', 'Colonnes', {type: 'column', tableFrom: 'table', required: true}),
            WidgetSDK.newItem('typeCol', null, 'Type', 'Colonne contenant le type de la tâche.', 'Colonnes', {type: 'column', tableFrom: 'table', required: true}),
            WidgetSDK.newItem('dateCol', null, 'Date limite', 'Colonne contenant la date limite de la tâche.', 'Colonnes', {type: 'column', tableFrom: 'table', required: true}),
            WidgetSDK.newItem('startDateCol', null, 'Date de début', 'Colonne contenant la date de début de la tâche.', 'Colonnes', {type: 'column', tableFrom: 'table', required: true}),
            WidgetSDK.newItem('descCol', null, 'Description', 'Colonne contenant la description de la tâche.', 'Colonnes', {type: 'column', tableFrom: 'table', required: true}),
            WidgetSDK.newItem('folderCol', null, 'Dossier', 'Colonne contenant le dossier de la tâche.', 'Colonnes', {type: 'column', tableFrom: 'table', required: false})
        ],
        '#config-view',
        '#main-view',
        {onOptChange: optionsChanged, onOptLoad: optionsChanged}
    );

    // Initialisation des métadonnées des colonnes
    W.initMetaData();

    // Initialisation du widget avec Grist
    W.ready({
        requiredAccess: 'full',
        allowSelectBy: true,
        columns: [
            {name: 'statusCol', title: 'État', description: 'Définir la colonne Kanban', type: 'Choice', strictType: true},
            {name: 'titleCol', title: 'Titre', description: 'Nom de la tâche', type: 'Any'},
            {name: 'projectRefCol', title: 'Référence du projet', description: 'Référence associée à la tâche', type: 'Any', optional: true},
            {name: 'assigneeRefCol', title: 'Référence des accompagnateurs', description: 'Référence aux accompagnateurs', type: 'Any', optional: true},
            {name: 'priorityCol', title: 'Priorité', description: 'Priorité de la tâche', type: 'Choice', optional: true},
            {name: 'typeCol', title: 'Type', description: 'Type de la tâche', type: 'Choice', optional: true},
            {name: 'dateCol', title: 'Date limite', description: 'Date limite de la tâche', type: 'Date', optional: true},
            {name: 'startDateCol', title: 'Date de début', description: 'Date de début de la tâche', type: 'Date', optional: true},
            {name: 'descCol', title: 'Description', description: 'Description de la tâche', type: 'Any', optional: true},
            {name: 'folderCol', title: 'Dossier', description: 'Dossier de la tâche', type: 'Any', optional: true}
        ],
        async onEditOptions() {
            await W.showConfig();
        }
    });

    // Souscription aux données de Grist
    W.onRecords(loadAllData, {expandRefs: false, keepEncoded: false, mapRef: true});

    // Initialisation du widget
    W.isLoaded().then(async () => {
        W.initDone = true;
    });

    // Écouteur pour les changements de mapping
    grist.on('message', async (e) => {
        if (e.mappingsChange) mappingChanged();
    });
});

// Fonction pour gérer les changements d'options
async function optionsChanged(opts) {
    await W.isMapped();
    loadAllData();
}

// Fonction pour gérer les changements de mapping
function mappingChanged() {
    buildDynamicConfigs();
    loadAllData();
}


/* -------------------------------------------------
   CONSTANTES & VARIABLES GLOBALES
------------------------------------------------- */
const PRIORITY_LABELS = { 'Élevée': 'Élevée', 'Moyenne': 'Moyenne', 'Basse': 'Basse' };
const PRIORITY_COLORS = { 'Élevée': '#ef4444', 'Moyenne': '#f59e0b', 'Basse': '#3b82f6' };
const DEFAULT_ETAT_COLORS = ['#7c2d12', '#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];


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
  return t[options?.priorityCol] || 'Basse';
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
    if (!options) return;

    // Récupérer les projets uniques depuis les colonnes de référence
    const projets = [...new Set(taches.map(t => getProjectNameFromRef(t)))].filter(p => p);
    projets.sort((a, b) => a.localeCompare(b));

    document.getElementById('filterProjetMenu').innerHTML = `
        <div class="filter-menu-header">Projets</div>
        <div class="filter-option ${!filters.projet ? 'active' : ''}" onclick="setFilter('projet', null)">Tous les projets</div>
        ${projets.map(p => `
            <div class="filter-option ${filters.projet === p ? 'active' : ''}" onclick="setFilter('projet', '${p}')">
                ${escapeHtml(p)}
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
}

function updateFilterUI() {
  const projBtn = document.querySelector('#filterProjet .filter-btn');
  const prioBtn = document.querySelector('#filterPriorite .filter-btn');
  const etatBtn = document.querySelector('#filterEtat .filter-btn');

  if (projBtn) projBtn.className = 'filter-btn' + (filters.projet ? ' active' : '');
  if (prioBtn) prioBtn.className = 'filter-btn' + (filters.priorite ? ' active' : '');
  if (etatBtn) etatBtn.className = 'filter-btn' + (filters.etat ? ' active' : '');

  if (projBtn) {
    document.getElementById('filterProjetLabel').textContent =
      filters.projet ? `Projet: ${escapeHtml(filters.projet)}` : 'Projet ▾';
  }

  if (prioBtn) {
    document.getElementById('filterPrioriteLabel').textContent =
      filters.priorite ? PRIORITY_LABELS[filters.priorite] : 'Priorité ▾';
  }

  if (etatBtn) {
    document.getElementById('filterEtatLabel').textContent =
      filters.etat ? filters.etat : 'État ▾';
  }

  const chips = [];
  if (filters.projet) chips.push(`<span class="filter-chip">${escapeHtml(filters.projet)} <button onclick="setFilter('projet', null)">×</button></span>`);
  if (filters.priorite) chips.push(`<span class="filter-chip">${PRIORITY_LABELS[filters.priorite]} <button onclick="setFilter('priorite', null)">×</button></span>`);
  if (filters.etat) chips.push(`<span class="filter-chip">${filters.etat} <button onclick="setFilter('etat', null)">×</button></span>`);

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
    // Filtre par projet
    if (filters.projet && getProjectNameFromRef(task) !== filters.projet) return false;
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

function getProjectNameFromRef(task) {
    if (!task || !options.projectRefCol) return null;
    const ref = task[options.projectRefCol];
    if (!ref) return null;
    return ref[options.projectNameCol] || "Inconnu";
}

function getAssigneeNameFromRef(assigneeRef) {
    if (!assigneeRef || !options.assigneeNameCol) return "Inconnu";
    if (typeof assigneeRef === 'object' && assigneeRef[options.assigneeNameCol]) {
        return assigneeRef[options.assigneeNameCol];
    }
    return "Inconnu";
}


unction renderTaskCard(task) {
    if (!options) return '';

    const priority = getTaskPriority(task);
    const deadline = gristToDate(task[options.dateCol]);
    const selected = task.id === selectedTaskId ? ' selected' : '';
    const assignees = getAssigneesArray(task);
    const projetName = getProjectNameFromRef(task);
    const isDeadlineOverdue = deadline && new Date() > deadline;

    let borderColor = '#ccc';
    if (groupBy === 'etat') {
        const cfg = ETAT_CONFIG[task[options.statusCol]];
        if (cfg) borderColor = cfg.color;
    } else {
        borderColor = PRIORITY_COLORS[priority];
    }

    let badges = '';

    if (groupBy !== 'priorite') {
        badges += `<span class="badge priority ${priority === 'Élevée' ? 'p1' : priority === 'Moyenne' ? 'p2' : 'p3'}">${priority}</span>`;
    }

    if (projetName) {
        const short = projetName.length > 10 ? projetName.substring(0, 10) + '…' : projetName;
        badges += `<span class="badge project" title="${escapeHtml(projetName)}">${escapeHtml(short)}</span>`;
    }

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
            const assigneeRef = task[options.assigneeRefCol];
            if (Array.isArray(assigneeRef)) {
                const assignee = assigneeRef.find(ref => ref.id === id);
                if (assignee) {
                    const name = assignee[options.assigneeNameCol];
                    assigneeHtml += `<div class="assignee-avatar" title="${escapeHtml(name)}">${getInitials(name)}</div>`;
                }
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
  selectedProjetId = getProjectNameFromRef(task);
  const projetValues = document.getElementById('projetValues');
  if (projetValues) {
    projetValues.innerHTML = `<span class="filter-chip">${escapeHtml(selectedProjetId)}</span>`;
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
  const projets = [...new Set(taches.map(t => getProjectNameFromRef(t)))].filter(p => p);
  const filteredProjets = projets.filter(p => p.toLowerCase().includes(searchTerm));

  const optionsHTML = filteredProjets.map(p => {
    const isSelected = selectedProjetId === p;
    return `
      <div class="multi-select-option ${isSelected ? 'selected' : ''}"
          onclick="selectProjet('${p}', '${escapeHtml(p)}')">
          ${escapeHtml(p)}
      </div>
    `;
  }).join('');

  document.getElementById('projetOptions').innerHTML = optionsHTML;
}

function selectProjet(nom, nomAffichage) {
  selectedProjetId = nom;
  const projetValues = document.getElementById('projetValues');
  if (projetValues) {
    projetValues.innerHTML = `<span class="filter-chip">${escapeHtml(nomAffichage)}</span>`;
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

  const projets = [...new Set(taches.map(t => getProjectNameFromRef(t)))].filter(p => p);
  projets.sort((a, b) => a.localeCompare(b));

  const optionsHTML = projets.map(p => {
    const isSelected = selectedProjetId === p;
    return `
      <div class="multi-select-option ${isSelected ? 'selected' : ''}"
          onclick="selectProjet('${p}', '${escapeHtml(p)}')">
          ${escapeHtml(p)}
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
  const assignees = [...new Set(taches.flatMap(t => t[options.assigneeRefCol] || []))].filter(a => a);
  const filteredAssignes = assignees.filter(a => getAssigneeNameFromRef(a).toLowerCase().includes(searchTerm));

  const optionsHTML = filteredAssignes.map(a => {
    const name = getAssigneeNameFromRef(a);
    const isSelected = selectedAssignees.includes(a.id);
    return `
      <div class="multi-select-option ${isSelected ? 'selected' : ''}"
           onclick="toggleAssignee(${a.id})">
        <input type="checkbox" ${isSelected ? 'checked' : ''}>
        ${escapeHtml(name)}
      </div>
    `;
  }).join('');

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
      const assigneeRef = taches.flatMap(t => t[options.assigneeRefCol] || []).find(a => a.id === id);
      const name = assigneeRef ? getAssigneeNameFromRef(assigneeRef) : "Inconnu";
      return `<span class="filter-chip">${escapeHtml(name)}</span>`;
    }).join('');
  }
}

function updateAssigneeDropdown() {
  const assigneDropdown = document.getElementById('assigneDropdown');
  if (!assigneDropdown) return;

  const assignees = [...new Set(taches.flatMap(t => t[options.assigneeRefCol] || []))].filter(a => a);

  const optionsHTML = assignees.map(a => {
    const name = getAssigneeNameFromRef(a);
    const isSelected = selectedAssignees.includes(a.id);
    return `
      <div class="multi-select-option ${isSelected ? 'selected' : ''}"
           onclick="toggleAssignee(${a.id})">
        <input type="checkbox" ${isSelected ? 'checked' : ''}>
        ${escapeHtml(name)}
      </div>
    `;
  }).join('');

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
async function loadAllData(recs) {
    if (!options) return;

    document.getElementById('loadingOverlay').style.display = 'flex';

    try {
        // Filtrer les tâches supprimées
        taches = recs.filter(r => !r.Supprime);

        // Construire les configurations dynamiques
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
        // Attendre que WidgetSDK soit prêt
        await W.isLoaded();

        // Charger les filtres
        loadFilters();

        // Souscrire aux changements de données
        grist.onRecords(async () => await loadAllData());

        // Écouteur pour les changements de sélection
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
