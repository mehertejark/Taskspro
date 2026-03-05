import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ── Firebase Configuration ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAxBqGcjCl-u2RoLS19swFQylG9kjRkq4Y",
  authDomain: "taskspro-2caf2.firebaseapp.com",
  databaseURL: "https://taskspro-2caf2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "taskspro-2caf2",
  storageBucket: "taskspro-2caf2.firebasestorage.app",
  messagingSenderId: "834110914419",
  appId: "1:834110914419:web:aa5bbca53b31541e7ecf06",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const DATA_REF = ref(db, "tasks-data");

async function saveData(data) {
  try { await set(DATA_REF, data); } catch (e) { console.error("Firebase save error", e); }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const PRIORITY_NEXT = { H: "M", M: "L", L: "H" };
const PRIORITY_COLOR = {
  H: { bg: "#fff3e0", text: "#e65100", border: "#ffb74d" },
  M: { bg: "#fffde7", text: "#b8860b", border: "#ffe082" },
  L: { bg: "#e8f5e9", text: "#2e7d32", border: "#a5d6a7" },
};

function sortActiveTasks(tasks, sort) {
  const active = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  let s = [...active];
  if (sort === "az") s.sort((a, b) => a.text.localeCompare(b.text));
  else if (sort === "priority") {
    const o = { H: 0, M: 1, L: 2 };
    s.sort((a, b) => (o[a.priority] ?? 9) - (o[b.priority] ?? 9));
  } else if (sort === "rank") {
    s.sort((a, b) => {
      if (a.rank == null && b.rank == null) return 0;
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      return a.rank - b.rank;
    });
  }
  return [...s, ...done];
}

function applySmartRank(allTasks, taskId, newRank) {
  let tasks = allTasks.map((t) => ({ ...t }));
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return allTasks;
  const oldRank = task.rank;
  if (newRank == null) {
    if (oldRank != null) tasks.forEach((t) => { if (t.id !== taskId && t.rank != null && t.rank > oldRank) t.rank--; });
    task.rank = null;
    return tasks;
  }
  if (oldRank == null) {
    tasks.forEach((t) => { if (t.id !== taskId && t.rank != null && t.rank >= newRank) t.rank++; });
    task.rank = newRank;
  } else if (newRank < oldRank) {
    tasks.forEach((t) => { if (t.id !== taskId && t.rank != null && t.rank >= newRank && t.rank < oldRank) t.rank++; });
    task.rank = newRank;
  } else if (newRank > oldRank) {
    tasks.forEach((t) => { if (t.id !== taskId && t.rank != null && t.rank > oldRank && t.rank <= newRank) t.rank--; });
    task.rank = newRank;
  }
  return tasks;
}

function clearAndCompactRank(allTasks, taskId) {
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || task.rank == null) return allTasks;
  const r = task.rank;
  return allTasks.map((t) => {
    if (t.id === taskId) return { ...t, rank: null };
    if (t.rank != null && t.rank > r) return { ...t, rank: t.rank - 1 };
    return t;
  });
}

function makeDefault() {
  const l1 = uid(), l2 = uid(), l3 = uid();
  return {
    listOrder: [l1, l2, l3],
    lists: [
      { id: l1, title: "My Tasks", sort: "manual" },
      { id: l2, title: "Work", sort: "manual" },
      { id: l3, title: "Personal", sort: "manual" },
    ],
    tasks: [
      { id: uid(), listId: l1, text: "Review project proposal", priority: "H", rank: 1, completed: false },
      { id: uid(), listId: l1, text: "Send weekly update email", priority: "M", rank: 3, completed: false },
      { id: uid(), listId: l2, text: "Fix critical bug in prod", priority: "H", rank: 2, completed: false },
      { id: uid(), listId: l2, text: "Write unit tests", priority: "L", rank: null, completed: false },
      { id: uid(), listId: l3, text: "Book dentist appointment", priority: "M", rank: 4, completed: false },
    ],
  };
}

// ── Sync Status Dot ───────────────────────────────────────────────────────────
function SyncDot({ status }) {
  const cfg = {
    connecting: { color: "#fbbc04", title: "Connecting…" },
    synced:     { color: "#34a853", title: "Synced — real-time" },
    saving:     { color: "#1a73e8", title: "Saving…" },
    error:      { color: "#ea4335", title: "Sync error" },
  }[status] ?? { color: "#9aa0a6", title: "" };
  return (
    <div title={cfg.title} style={{
      width: 8, height: 8, borderRadius: "50%", background: cfg.color,
      flexShrink: 0, transition: "background 0.3s",
      boxShadow: status === "saving" ? `0 0 0 3px ${cfg.color}33` : "none",
    }} />
  );
}

// ── PriorityBtn ───────────────────────────────────────────────────────────────
function PriorityBtn({ priority, onChange }) {
  const c = PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.M;
  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onChange(PRIORITY_NEXT[priority] ?? "H"); }}
      title="Click to cycle priority"
      style={{
        background: c.bg, color: c.text, border: `1.5px solid ${c.border}`,
        borderRadius: 4, fontWeight: 700, fontSize: 10, lineHeight: "14px",
        padding: "1px 5px", cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
        minWidth: 22, textAlign: "center", userSelect: "none", WebkitTapHighlightColor: "transparent",
      }}
    >{priority ?? "M"}</button>
  );
}

// ── RankField ─────────────────────────────────────────────────────────────────
function RankField({ rank, onChange }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(rank ?? "");
  const ref = useRef();
  useEffect(() => { if (!editing) setVal(rank ?? ""); }, [rank, editing]);
  const commit = () => {
    setEditing(false);
    if (val === "" || val == null) { onChange(null); return; }
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) onChange(n);
    else { onChange(null); setVal(""); }
  };
  if (editing) return (
    <input ref={ref} type="number" min={1} value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setVal(rank ?? ""); } }}
      onClick={(e) => e.stopPropagation()}
      style={{ width: 40, fontSize: 11, textAlign: "center", border: "1.5px solid #1a73e8", borderRadius: 4, padding: "1px 3px", outline: "none", background: "#e8f0fe", color: "#1a73e8", fontFamily: "inherit", flexShrink: 0 }}
      autoFocus />
  );
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); setEditing(true); setTimeout(() => ref.current?.select(), 40); }}
      title="Click to set rank"
      style={{
        minWidth: 40, fontSize: 11, textAlign: "center",
        border: `1.5px solid ${rank != null ? "#1a73e8" : "#dadce0"}`,
        borderRadius: 4, padding: "1px 4px",
        background: rank != null ? "#e8f0fe" : "#f8f9fa",
        color: rank != null ? "#1a73e8" : "#9aa0a6",
        cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
        WebkitTapHighlightColor: "transparent",
      }}
    >{rank != null ? `#${rank}` : "—"}</button>
  );
}

// ── InlineText ────────────────────────────────────────────────────────────────
function InlineText({ value, onSave, textStyle = {}, placeholder = "" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => { if (!editing) setVal(value); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    if (val.trim()) onSave(val.trim());
    else setVal(value);
  };
  if (editing) return (
    <input value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setVal(value); } }}
      style={{ flex: 1, border: "none", borderBottom: "2px solid #1a73e8", outline: "none", fontSize: 14, background: "transparent", fontFamily: "inherit", color: "#202124", minWidth: 0, ...textStyle }}
      autoFocus />
  );
  return (
    <span onDoubleClick={() => setEditing(true)} title="Double-click to edit"
      style={{ flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text", minWidth: 0, ...textStyle }}
    >{value || <span style={{ color: "#9aa0a6" }}>{placeholder}</span>}</span>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────
function TaskRow({ task, onUpdate, onDelete, onComplete, onRank, onPriority, isDragging, onDragStart, onDragEnd, onDragOver, onDrop }) {
  return (
    <div draggable
      onDragStart={(e) => { e.dataTransfer.setData("taskId", task.id); onDragStart(task.id); }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver(task.id); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(task.id); }}
      style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", background: isDragging ? "#e8f0fe" : "white", borderBottom: "1px solid #f1f3f4", cursor: "grab", opacity: task.completed ? 0.65 : 1, minWidth: 0 }}
    >
      <input type="checkbox" checked={task.completed} onChange={() => onComplete(task.id)}
        onClick={(e) => e.stopPropagation()}
        style={{ accentColor: "#1a73e8", flexShrink: 0, width: 15, height: 15, cursor: "pointer" }} />
      <InlineText value={task.text} onSave={(t) => onUpdate(task.id, { text: t })}
        textStyle={task.completed ? { textDecoration: "line-through", color: "#9aa0a6" } : { color: "#202124" }}
        placeholder="Task" />
      <PriorityBtn priority={task.priority} onChange={(p) => onPriority(task.id, p)} />
      <RankField rank={task.rank} onChange={(r) => onRank(task.id, r)} />
      <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#bdbdbd", fontSize: 17, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
        title="Delete">×</button>
    </div>
  );
}

// ── NewTask ───────────────────────────────────────────────────────────────────
function NewTask({ onAdd }) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState("M");
  const submit = () => { if (!text.trim()) return; onAdd(text.trim(), priority); setText(""); setPriority("M"); };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderTop: "1px solid #f1f3f4", background: "#fafafa", flexShrink: 0 }}>
      <span style={{ color: "#9aa0a6", fontSize: 16, flexShrink: 0 }}>+</span>
      <input value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="Add a task"
        style={{ flex: 1, border: "none", outline: "none", fontSize: 13, background: "transparent", fontFamily: "inherit", color: "#202124", minWidth: 0 }} />
      <PriorityBtn priority={priority} onChange={setPriority} />
      <button onClick={submit}
        style={{ background: "#1a73e8", color: "white", border: "none", borderRadius: 4, fontSize: 12, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Add</button>
    </div>
  );
}

// ── ListCard ──────────────────────────────────────────────────────────────────
function ListCard({ list, tasks, onAddTask, onUpdateTask, onDeleteTask, onCompleteTask, onRank, onPriority, onDeleteList, onRenameList, onSortChange, onTaskDragStart, onTaskDragEnd, onTaskDragOver, onTaskDrop, onListDragStart, onListDragEnd, onListDragOver, onListDrop, isListDragging, draggingTaskId }) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const sorted = sortActiveTasks(tasks, list.sort);
  const active = sorted.filter((t) => !t.completed);
  const done = sorted.filter((t) => t.completed);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onListDragOver(list.id); }}
      onDrop={(e) => { e.preventDefault(); onListDrop(list.id); }}
      style={{ width: 300, minWidth: 300, flexShrink: 0, background: "white", borderRadius: 8, border: `2px solid ${isListDragging ? "#1a73e8" : "#e0e0e0"}`, boxShadow: "0 1px 3px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 80px)" }}
    >
      <div draggable
        onDragStart={(e) => { e.dataTransfer.setData("listId", list.id); onListDragStart(list.id); }}
        onDragEnd={onListDragEnd}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 10px", borderBottom: "1px solid #f1f3f4", background: "#f8f9fa", cursor: "grab", flexShrink: 0, borderRadius: "6px 6px 0 0" }}
      >
        <span style={{ color: "#bdbdbd", fontSize: 12, flexShrink: 0 }}>⠿</span>
        <InlineText value={list.title} onSave={(t) => onRenameList(list.id, t)} textStyle={{ fontWeight: 600, color: "#202124" }} placeholder="List name" />
        <select value={list.sort} onChange={(e) => onSortChange(list.id, e.target.value)} onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 11, border: "1px solid #dadce0", borderRadius: 4, padding: "2px 3px", background: "white", color: "#5f6368", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          <option value="manual">Manual</option>
          <option value="az">A→Z</option>
          <option value="priority">Priority</option>
          <option value="rank">Rank</option>
        </select>
        <button onClick={() => onDeleteList(list.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#bdbdbd", fontSize: 17, padding: "0 2px", lineHeight: 1, flexShrink: 0 }} title="Delete list">×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active.length === 0 && <div style={{ padding: "18px 10px", color: "#9aa0a6", fontSize: 13, textAlign: "center" }}>No tasks yet</div>}
        {active.map((t) => (
          <TaskRow key={t.id} task={t} isDragging={draggingTaskId === t.id}
            onUpdate={onUpdateTask} onDelete={onDeleteTask} onComplete={onCompleteTask} onRank={onRank} onPriority={onPriority}
            onDragStart={onTaskDragStart} onDragEnd={onTaskDragEnd}
            onDragOver={(overId) => onTaskDragOver(overId, list.id)}
            onDrop={(overId) => onTaskDrop(overId, list.id)} />
        ))}
        {done.length > 0 && (
          <>
            <button onClick={() => setCompletedOpen((o) => !o)}
              style={{ width: "100%", textAlign: "left", padding: "5px 10px", background: "#f8f9fa", border: "none", borderTop: "1px solid #f1f3f4", fontSize: 12, color: "#5f6368", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", transform: completedOpen ? "rotate(90deg)" : "none", transition: "transform .2s" }}>▶</span>
              &nbsp;Completed ({done.length})
            </button>
            {completedOpen && done.map((t) => (
              <TaskRow key={t.id} task={t} isDragging={false}
                onUpdate={onUpdateTask} onDelete={onDeleteTask} onComplete={onCompleteTask} onRank={onRank} onPriority={onPriority}
                onDragStart={onTaskDragStart} onDragEnd={onTaskDragEnd}
                onDragOver={(overId) => onTaskDragOver(overId, list.id)}
                onDrop={(overId) => onTaskDrop(overId, list.id)} />
            ))}
          </>
        )}
      </div>
      <NewTask onAdd={(text, pri) => onAddTask(list.id, text, pri)} />
    </div>
  );
}

// ── SummaryView ───────────────────────────────────────────────────────────────
function SummaryView({ allTasks, onComplete, onRank, onPriority }) {
  const ranked = allTasks.filter((t) => t.rank != null && !t.completed).sort((a, b) => a.rank - b.rank);
  return (
    <div style={{ padding: "20px 24px", maxWidth: 640 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#202124" }}>⭐ Focus Summary</h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#5f6368" }}>Ranked tasks in ascending order</p>
      {ranked.length === 0
        ? <div style={{ padding: 24, background: "white", borderRadius: 8, border: "1px solid #e0e0e0", color: "#9aa0a6", fontSize: 14, textAlign: "center" }}>No ranked tasks yet. Click — on any task to assign a rank.</div>
        : ranked.map((task) => (
          <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "white", borderRadius: 8, border: "1px solid #e0e0e0", marginBottom: 6, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
            <span style={{ fontSize: 12, color: "#1a73e8", fontWeight: 700, minWidth: 26, flexShrink: 0 }}>#{task.rank}</span>
            <input type="checkbox" checked={task.completed} onChange={() => onComplete(task.id)} style={{ accentColor: "#1a73e8", flexShrink: 0, width: 15, height: 15, cursor: "pointer" }} />
            <span style={{ flex: 1, fontSize: 14, color: "#202124", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.text}</span>
            <PriorityBtn priority={task.priority} onChange={(p) => onPriority(task.id, p)} />
            <RankField rank={task.rank} onChange={(r) => onRank(task.id, r)} />
          </div>
        ))
      }
    </div>
  );
}

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ label, icon, count, active, onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 24, cursor: "pointer", marginBottom: 2, background: active ? "#e8f0fe" : "transparent", color: active ? "#1a73e8" : "#202124", fontWeight: active ? 600 : 400, fontSize: 14, userSelect: "none" }}>
      {icon && <span style={{ color: "#9aa0a6", fontSize: 12 }}>{icon}</span>}
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {count != null && <span style={{ fontSize: 11, color: "#9aa0a6" }}>{count}</span>}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null);
  const [activeView, setActiveView] = useState("__summary__");
  const [syncStatus, setSyncStatus] = useState("connecting");
  const [ready, setReady] = useState(false);

  const saveTimer = useRef(null);
  const isRemoteUpdate = useRef(false); // flag to avoid save loop
  const taskDragRef = useRef({});
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const listDragRef = useRef({});
  const [draggingListId, setDraggingListId] = useState(null);

  // ── Real-time listener — fires instantly when any device changes data ──
  useEffect(() => {
    const unsub = onValue(DATA_REF, (snapshot) => {
      const val = snapshot.val();
      isRemoteUpdate.current = true;
      if (val) {
        setData(val);
      } else {
        // First time — no data in Firebase yet, seed with defaults
        const defaults = makeDefault();
        setData(defaults);
        set(DATA_REF, defaults);
      }
      setReady(true);
      setSyncStatus("synced");
    }, (error) => {
      console.error("Firebase error", error);
      setSyncStatus("error");
      // Fall back to empty state so app still loads
      setData(makeDefault());
      setReady(true);
    });
    return () => unsub();
  }, []);

  const persist = useCallback((d) => {
    clearTimeout(saveTimer.current);
    setSyncStatus("saving");
    saveTimer.current = setTimeout(async () => {
      await saveData(d);
      setSyncStatus("synced");
    }, 400); // 400ms debounce — fast but avoids saving on every keystroke
  }, []);

  const update = useCallback((fn) => {
    setData((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, [persist]);

  if (!ready) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "Google Sans, Roboto, sans-serif", color: "#5f6368", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 28 }}>✓</div>
      <div style={{ fontSize: 15 }}>Connecting to sync…</div>
    </div>
  );

  const { lists, tasks, listOrder } = data;
  const orderedLists = listOrder.map((id) => lists.find((l) => l.id === id)).filter(Boolean);

  // ── List ops ──
  const addList = () => { const id = uid(); update((d) => ({ ...d, lists: [...d.lists, { id, title: "New List", sort: "manual" }], listOrder: [...d.listOrder, id] })); setActiveView(id); };
  const deleteList = (listId) => {
    update((d) => {
      const removedIds = d.tasks.filter((t) => t.listId === listId).map((t) => t.id);
      let ts = [...d.tasks];
      removedIds.forEach((tid) => { ts = clearAndCompactRank(ts, tid); });
      return { ...d, lists: d.lists.filter((l) => l.id !== listId), tasks: ts.filter((t) => t.listId !== listId), listOrder: d.listOrder.filter((id) => id !== listId) };
    });
    if (activeView === listId) setActiveView("__summary__");
  };
  const renameList = (listId, title) => update((d) => ({ ...d, lists: d.lists.map((l) => l.id === listId ? { ...l, title } : l) }));
  const sortList = (listId, sort) => update((d) => ({ ...d, lists: d.lists.map((l) => l.id === listId ? { ...l, sort } : l) }));

  // ── Task ops ──
  const addTask = (listId, text, priority) => update((d) => ({ ...d, tasks: [...d.tasks, { id: uid(), listId, text, priority, rank: null, completed: false }] }));
  const updateTask = (taskId, patch) => update((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === taskId ? { ...t, ...patch } : t) }));
  const deleteTask = (taskId) => update((d) => ({ ...d, tasks: clearAndCompactRank(d.tasks, taskId).filter((t) => t.id !== taskId) }));
  const completeTask = (taskId) => update((d) => {
    const task = d.tasks.find((t) => t.id === taskId);
    if (!task) return d;
    if (!task.completed) {
      const ts = clearAndCompactRank(d.tasks, taskId).map((t) => t.id === taskId ? { ...t, completed: true } : t);
      return { ...d, tasks: ts };
    }
    return { ...d, tasks: d.tasks.map((t) => t.id === taskId ? { ...t, completed: false } : t) };
  });
  const changeRank = (taskId, r) => update((d) => ({ ...d, tasks: applySmartRank(d.tasks, taskId, r) }));
  const changePriority = (taskId, p) => update((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === taskId ? { ...t, priority: p } : t) }));

  // ── Task drag ──
  const onTaskDragStart = (taskId) => { taskDragRef.current = { taskId }; setDraggingTaskId(taskId); };
  const onTaskDragEnd = () => { setDraggingTaskId(null); taskDragRef.current = {}; };
  const onTaskDragOver = (overTaskId, toListId) => { taskDragRef.current.overTaskId = overTaskId; taskDragRef.current.toListId = toListId; };
  const onTaskDrop = (overTaskId, toListId) => {
    const { taskId } = taskDragRef.current;
    if (!taskId || taskId === overTaskId) { onTaskDragEnd(); return; }
    update((d) => {
      let ts = [...d.tasks];
      const fi = ts.findIndex((t) => t.id === taskId);
      const ti = ts.findIndex((t) => t.id === overTaskId);
      if (fi < 0 || ti < 0) return d;
      const [moved] = ts.splice(fi, 1);
      moved.listId = toListId;
      ts.splice(ti, 0, moved);
      return { ...d, tasks: ts };
    });
    onTaskDragEnd();
  };

  // ── List drag ──
  const onListDragStart = (listId) => { listDragRef.current = { listId }; setDraggingListId(listId); };
  const onListDragEnd = () => { setDraggingListId(null); listDragRef.current = {}; };
  const onListDragOver = (overListId) => { listDragRef.current.overListId = overListId; };
  const onListDrop = (toListId) => {
    const { listId } = listDragRef.current;
    if (!listId || listId === toListId) { onListDragEnd(); return; }
    update((d) => {
      const order = [...d.listOrder];
      const fi = order.indexOf(listId), ti = order.indexOf(toListId);
      if (fi < 0 || ti < 0) return d;
      order.splice(fi, 1); order.splice(ti, 0, listId);
      return { ...d, listOrder: order };
    });
    onListDragEnd();
  };

  const visibleLists = activeView === "__all__" ? orderedLists : orderedLists.filter((l) => l.id === activeView);
  const sharedProps = {
    onUpdateTask: updateTask, onDeleteTask: deleteTask, onCompleteTask: completeTask,
    onRank: changeRank, onPriority: changePriority,
    onTaskDragStart, onTaskDragEnd, onTaskDragOver, onTaskDrop,
    onListDragStart, onListDragEnd, onListDragOver, onListDrop, draggingTaskId,
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Google Sans', Roboto, Arial, sans-serif", background: "#f8f9fa", overflow: "hidden" }}>

      {/* Sidebar */}
      <aside style={{ width: 220, minWidth: 220, background: "white", borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 14px 10px" }}>
          <span style={{ fontSize: 22 }}>✓</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#202124", flex: 1 }}>Tasks</span>
          <SyncDot status={syncStatus} />
        </div>
        <nav style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
          <NavItem label="⭐ Focus Summary" active={activeView === "__summary__"} onClick={() => setActiveView("__summary__")} />
          <NavItem label="⊞ Board View" active={activeView === "__all__"} onClick={() => setActiveView("__all__")} />
          <div style={{ borderTop: "1px solid #f1f3f4", margin: "6px 0" }} />
          <div style={{ fontSize: 11, color: "#9aa0a6", padding: "0 12px 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>My Lists</div>
          {orderedLists.map((list) => (
            <NavItem key={list.id} label={list.title} icon="☰"
              count={tasks.filter((t) => t.listId === list.id && !t.completed).length}
              active={activeView === list.id} onClick={() => setActiveView(list.id)} />
          ))}
        </nav>
        <div style={{ padding: "8px 10px", borderTop: "1px solid #f1f3f4" }}>
          <button onClick={addList} style={{ width: "100%", padding: "7px 10px", borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontSize: 14, color: "#1a73e8", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New list
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeView === "__summary__" ? (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <SummaryView allTasks={tasks} onComplete={completeTask} onRank={changeRank} onPriority={changePriority} />
          </div>
        ) : (
          <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
            {visibleLists.map((list) => (
              <ListCard key={list.id} list={list} tasks={tasks.filter((t) => t.listId === list.id)}
                isListDragging={draggingListId === list.id}
                onAddTask={addTask} onDeleteList={deleteList} onRenameList={renameList} onSortChange={sortList}
                {...sharedProps} />
            ))}
            <button onClick={addList} style={{ flexShrink: 0, height: 48, padding: "0 18px", border: "2px dashed #dadce0", borderRadius: 8, background: "transparent", color: "#5f6368", cursor: "pointer", fontSize: 13, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", alignSelf: "flex-start" }}>
              + New list
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
