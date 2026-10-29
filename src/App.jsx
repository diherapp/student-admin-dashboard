import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, onSnapshot, getDoc, getDocs, doc, addDoc, deleteDoc, setDoc,
  writeBatch, query, orderBy, where, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { auth, db, createStudent, manageStudent, firebaseConfigured, missingFirebaseConfig } from './firebase';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const iconPaths = {
  shield: <><path d="M12 3 19 6v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  user: <><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></>,
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></>,
  students: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1H3Z" /><path d="M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1h-3" /></>,
  attendance: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 10h16m-11 5 2 2 4-4" /></>,
  tasks: <><path d="M8 4h11a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2" /><path d="m8 12 2 2 4-4M8 7h7" /></>,
  achievements: <><path d="M12 3 14.8 9l6.2.8-4.5 4.3 1.1 6.1L12 17.3l-5.6 2.9 1.1-6.1L3 9.8 9.2 9 12 3Z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
  logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};
function Icon({ name, size = 20 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>;
}
const errText = (e) => {
  const messages = {
    'server-config/missing': 'Student creation is not configured on Vercel. Add FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT under Project Settings → Environment Variables, then redeploy.',
    'permission-denied': 'Firestore denied access to student records. Check that the Firestore rules are deployed and that you are signed in with the admin account.',
    'unauthenticated': 'Your sign-in has expired. Sign in again and retry.',
    'local-service/unavailable': 'The local Spark admin service is not running. Start it in a second terminal and try again.',
    'already-exists': 'That student username is already in use.',
    'permission-denied-api': 'Only an admin account can manage student records.',
    'not-found': 'The student account no longer exists.',
    'functions/already-exists': 'That student username is already in use.',
    'functions/failed-precondition': 'Firebase is missing the project configuration required to create student accounts.',
    'functions/internal': 'The server could not add this student. Check Firebase Functions logs for createStudent to see the underlying error.',
    'functions/not-found': 'The createStudent Firebase Function is not deployed. Deploy the latest Firebase Functions and try again.',
    'functions/permission-denied': 'Your account does not have admin permission. Sign out and sign back in, then try again.',
    'functions/unavailable': 'Firebase Functions is temporarily unavailable. Try again in a moment.',
    'functions/unauthenticated': 'Your sign-in has expired. Sign in again and retry.',
  };
  return messages[e?.code] || e?.message?.replace('Firebase: ', '') || 'Something went wrong';
};

function useStudents() {
  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');
  useEffect(
    () => onSnapshot(
      collection(db, 'students'),
      (snapshot) => {
        setStudents(snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.rollNo || '').localeCompare(b.rollNo || '')));
        setError('');
      },
      (e) => {
        setStudents([]);
        setError(errText(e));
      },
    ),
    []
  );
  return { students, error };
}

function Login() {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const username = f.get('username').trim().toLowerCase();
    const email = `${username}@${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`;
    setBusy(true); setErr('');
    try { await signInWithEmailAndPassword(auth, email, f.get('password')); }
    catch {
      setErr('Sign-in failed. Check the username and password, and confirm the admin account has been created in Firebase.');
      setBusy(false);
    }
  };
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="login-mark"><Icon name="shield" size={54} /></div>
          <h1>HRMS Admin Dashboard</h1>
        </div>
        <label className="login-field">
          <span>Username</span>
          <span className="input-icon"><Icon name="user" size={17} /><input name="username" type="text" autoComplete="username" required autoFocus /></span>
        </label>
        <label className="login-field">
          <span>Password</span>
          <span className="input-icon"><Icon name="lock" size={17} /><input name="password" type="password" autoComplete="current-password" required /></span>
        </label>
        {err && <p className="err">{err}</p>}
        <button className="login-submit" disabled={busy}>{busy ? 'Signing in…' : <><Icon name="logout" size={15} /> Login</>}</button>
      </form>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const { students, error: studentsError } = useStudents();
  const [tasks, setTasks] = useState(0);
  const [att, setAtt] = useState({ present: 0, absent: 0, late: 0 });
  useEffect(() => onSnapshot(collection(db, 'tasks'), (q) => setTasks(q.size)), []);
  useEffect(() => {
    (async () => {
      const r = { present: 0, absent: 0, late: 0 };
      await Promise.all(students.map(async (s) => {
        const d = await getDoc(doc(db, 'students', s.id, 'attendance', today()));
        if (d.exists() && r[d.data().status] !== undefined) r[d.data().status]++;
      }));
      setAtt(r);
    })();
  }, [students]);
  const marked = att.present + att.absent + att.late;
  const Stat = ({ n, l, detail, icon, tone, link, action }) => (
    <section className="overview-card">
      <div className={`overview-icon ${tone}`}><Icon name={icon} /></div>
      <span className="eyebrow">{l}</span>
      <strong className={tone}>{n}</strong>
      <span className="stat-detail">{detail}</span>
      <button className="text-action" onClick={() => navigate(link)}>{action}<Icon name="arrow" size={16} /></button>
    </section>
  );
  return (
    <div className="dashboard-page">
      {studentsError && <p className="err">{studentsError}</p>}
      <div className="page-heading">
        <div><h2>Administrative Overview</h2><p>Student attendance, tasks, and academic records</p></div>
        <button className="primary-action" onClick={() => navigate('/attendance')}><Icon name="attendance" size={17} /> Today&apos;s Attendance</button>
      </div>
      <div className="overview-grid">
        <Stat n={students.length} l="Total Students" detail="Registered students" icon="students" tone="blue" link="/students" action="View student directory" />
        <Stat n={tasks} l="Active Tasks" detail="Assigned learning tasks" icon="clock" tone="green" link="/tasks" action="Manage tasks" />
        <Stat n={att.present} l="Today&apos;s Attendance" detail={`Visits recorded today: ${marked}`} icon="attendance" tone="cyan" link="/attendance" action="Review attendance" />
        <Stat n={Math.max(students.length - marked, 0)} l="Not Marked Today" detail={`${att.absent} absent · ${att.late} late`} icon="achievements" tone="amber" link="/attendance" action="Review daily records" />
      </div>
      <div className="dashboard-panels">
        <section className="panel">
          <header><span><Icon name="tasks" /> Task Management</span><NavLink to="/tasks">View all</NavLink></header>
          <div className="panel-body"><span className="eyebrow">TOTAL ASSIGNED TASKS</span><strong>{tasks}</strong><p>Track assignments and student progress</p><button className="outline-action" onClick={() => navigate('/tasks')}>Manage tasks <Icon name="arrow" size={16} /></button></div>
        </section>
        <section className="panel">
          <header><span><Icon name="attendance" /> Attendance</span><NavLink to="/attendance">View all</NavLink></header>
          <div className="panel-body"><span className="eyebrow">STUDENTS MARKED TODAY</span><strong>{marked}<small> / {students.length}</small></strong><p>{att.present} present · {att.absent} absent · {att.late} late</p><button className="outline-action" onClick={() => navigate('/attendance')}>Review attendance <Icon name="arrow" size={16} /></button></div>
        </section>
        <section className="panel">
          <header><span><Icon name="achievements" /> Student Records</span><NavLink to="/achievements">View all</NavLink></header>
          <div className="panel-body"><span className="eyebrow">STUDENT ACHIEVEMENTS</span><strong><Icon name="students" size={25} /></strong><p>Review accomplishments and student profiles</p><button className="outline-action" onClick={() => navigate('/achievements')}>View achievements <Icon name="arrow" size={16} /></button></div>
        </section>
      </div>
    </div>
  );
}

function Students() {
  const { students, error: studentsError } = useStudents();
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [msgError, setMsgError] = useState(false);
  const [creationConfig, setCreationConfig] = useState(import.meta.env.DEV ? 'local' : 'checking');
  useEffect(() => {
    if (import.meta.env.DEV) return undefined;

    let active = true;
    fetch('/api/students')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Setup check failed with HTTP ${response.status}.`);
        const result = await response.json();
        if (typeof result.configured !== 'boolean') {
          throw new Error('Setup check returned an invalid response.');
        }
        if (active) setCreationConfig(result.configured ? 'ready' : 'missing');
      })
      .catch((error) => {
        console.error('Could not check student-creation configuration:', error);
        if (active) setCreationConfig('unavailable');
      });

    return () => { active = false; };
  }, []);
  const run = async (fn) => {
    setMsg('');
    setMsgError(false);
    try {
      await fn();
      setMsg('Done.');
    } catch (e) {
      setMsg(errText(e));
      setMsgError(true);
    }
  };
  const add = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    run(async () => { await createStudent(f); e.target.reset(); });
  };
  const list = students.filter((s) => `${s.name} ${s.rollNo} ${s.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h2>Students</h2>
      {studentsError && <p className="err">{studentsError}</p>}
      {(creationConfig === 'local' || creationConfig === 'missing' || creationConfig === 'unavailable') && (
        <p className="note">
          {creationConfig === 'local' && 'On Spark, keep the local admin service running in a second terminal to add or manage student accounts. '}
          {creationConfig === 'missing' && 'To add or manage student accounts on this deployment, configure FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT in Vercel Project Settings → Environment Variables, then redeploy. '}
          {creationConfig === 'unavailable' && 'Could not check whether student account management is configured. If an action fails, check the Vercel Function logs. '}
        </p>
      )}
      <form className="card row" onSubmit={add}>
        <input name="username" placeholder="Student username (login)" autoComplete="username" required />
        <input name="password" type="password" placeholder="Password (min 6)" minLength={6} required />
        <input name="name" placeholder="Full name" required />
        <input name="rollNo" placeholder="Roll no" />
        <input name="department" placeholder="Department" />
        <input name="year" placeholder="Year" />
        <button>Add student</button>
      </form>
      {msg && <p className={msgError ? 'err' : 'note'}>{msg}</p>}
      <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scroll"><table>
        <thead><tr><th>Roll</th><th>Name</th><th>Dept</th><th>Year</th><th>Login username</th><th></th></tr></thead>
        <tbody>{list.map((s) => (
          <tr key={s.id}>
            <td>{s.rollNo}</td><td>{s.name}</td><td>{s.department}</td><td>{s.year}</td><td>{s.username || s.email?.split('@')[0]}</td>
            <td className="acts">
              <button onClick={() => { const password = prompt('New password (min 6):'); if (password) run(() => manageStudent('resetStudentPassword', { uid: s.id, newPassword: password })); }}>Reset pw</button>
              <button className="danger" onClick={() => confirm(`Delete ${s.name} and all their data?`) && run(() => manageStudent('deleteStudent', { uid: s.id }))}>Delete</button>
            </td>
          </tr>))}
        </tbody>
      </table></div>
    </>
  );
}

function Attendance() {
  const { students, error: studentsError } = useStudents();
  const [date, setDate] = useState(today());
  const [m, setM] = useState({});
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let off = false;
    (async () => {
      const r = {};
      await Promise.all(students.map(async (s) => {
        const d = await getDoc(doc(db, 'students', s.id, 'attendance', date));
        if (d.exists()) r[s.id] = d.data().status;
      }));
      if (!off) setM(r);
    })();
    return () => { off = true; };
  }, [students, date]);
  const save = async () => {
    try {
      const b = writeBatch(db);
      Object.entries(m).forEach(([uid, status]) =>
        b.set(doc(db, 'students', uid, 'attendance', date), { date, status, note: '' }));
      await b.commit();
      setMsg('Saved.');
    } catch (e) { setMsg(errText(e)); }
  };
  return (
    <>
      <h2>Attendance</h2>
      {studentsError && <p className="err">{studentsError}</p>}
      <div className="row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button onClick={() => setM(Object.fromEntries(students.map((s) => [s.id, 'present'])))}>Mark all present</button>
        <button onClick={save}>Save</button>
        {msg && <span className="note">{msg}</span>}
      </div>
      <div className="scroll"><table>
        <thead><tr><th>Roll</th><th>Name</th><th>Status</th></tr></thead>
        <tbody>{students.map((s) => (
          <tr key={s.id}><td>{s.rollNo}</td><td>{s.name}</td>
            <td className="acts">{['present', 'absent', 'late'].map((st) => (
              <button key={st} className={m[s.id] === st ? `on ${st}` : ''} onClick={() => setM({ ...m, [s.id]: st })}>{st}</button>))}
            </td></tr>))}
        </tbody>
      </table></div>
    </>
  );
}

function Tasks() {
  const { students, error: studentsError } = useStudents();
  const [tasks, setTasks] = useState([]);
  const [done, setDone] = useState({});
  const [sel, setSel] = useState([]);
  const [msg, setMsg] = useState('');
  useEffect(() => onSnapshot(query(collection(db, 'tasks'), orderBy('createdAt', 'desc')),
    (q) => setTasks(q.docs.map((d) => ({ id: d.id, ...d.data() })))), []);
  useEffect(() => {
    (async () => {
      const r = {};
      await Promise.all(students.map(async (s) => {
        const q = await getDocs(collection(db, 'students', s.id, 'taskStatus'));
        r[s.id] = new Set(q.docs.filter((d) => d.data().done).map((d) => d.id));
      }));
      setDone(r);
    })();
  }, [students, tasks]);
  const add = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (!sel.length) return setMsg('Pick at least one student.');
    try {
      await addDoc(collection(db, 'tasks'), {
        title: f.title, description: f.description, priority: f.priority,
        dueDate: Timestamp.fromDate(new Date(f.dueDate + 'T23:59:00')),
        assignedTo: sel, createdAt: serverTimestamp(),
      });
      e.target.reset(); setSel([]); setMsg('Task created.');
    } catch (x) { setMsg(errText(x)); }
  };
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <>
      <h2>Tasks</h2>
      {studentsError && <p className="err">{studentsError}</p>}
      <form className="card" onSubmit={add}>
        <div className="row">
          <input name="title" placeholder="Title" required />
          <select name="priority"><option value="normal">Normal</option><option value="high">High</option></select>
          <input name="dueDate" type="date" required />
        </div>
        <textarea name="description" placeholder="Description" rows={2} />
        <div className="chips">
          <button type="button" onClick={() => setSel(students.map((s) => s.id))}>All</button>
          <button type="button" onClick={() => setSel([])}>None</button>
          {students.map((s) => (
            <label key={s.id} className={sel.includes(s.id) ? 'chip on' : 'chip'}>
              <input type="checkbox" checked={sel.includes(s.id)} onChange={() => toggle(s.id)} />{s.name}
            </label>))}
        </div>
        <button>Create task</button> {msg && <span className="note">{msg}</span>}
      </form>
      <div className="scroll"><table>
        <thead><tr><th>Title</th><th>Priority</th><th>Due</th><th>Completed</th><th></th></tr></thead>
        <tbody>{tasks.map((t) => {
          const n = (t.assignedTo || []).filter((u) => done[u]?.has(t.id)).length;
          return (
            <tr key={t.id}><td>{t.title}</td><td>{t.priority}</td>
              <td>{t.dueDate?.toDate().toLocaleDateString()}</td>
              <td>{n}/{(t.assignedTo || []).length}</td>
              <td><button className="danger" onClick={() => confirm('Delete task?') && deleteDoc(doc(db, 'tasks', t.id))}>Delete</button></td></tr>);
        })}</tbody>
      </table></div>
    </>
  );
}

function Achievements() {
  const { students, error: studentsError } = useStudents();
  const [uid, setUid] = useState('');
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!uid) return setList([]);
    return onSnapshot(query(collection(db, 'students', uid, 'achievements'), orderBy('createdAt', 'desc')),
      (q) => setList(q.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [uid]);
  return (
    <>
      <h2>Achievements</h2>
      {studentsError && <p className="err">{studentsError}</p>}
      <select value={uid} onChange={(e) => setUid(e.target.value)}>
        <option value="">Select a student…</option>
        {students.map((s) => <option key={s.id} value={s.id}>{s.rollNo} · {s.name}</option>)}
      </select>
      {uid && !list.length && <p className="note">No achievements yet.</p>}
      {list.map((a) => (
        <div className="card" key={a.id}>
          <b>{a.title}</b>
          <p>{a.summary}</p>
          {a.link && <a href={a.link} target="_blank" rel="noreferrer">Link</a>}{' '}
          {a.pdfUrl && <a href={a.pdfUrl} target="_blank" rel="noreferrer">{a.pdfName || 'PDF'}</a>}
        </div>))}
    </>
  );
}

function StudentPortal({ user }) {
  const [student, setStudent] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [tasks, setTasks] = useState([]);
  const [taskStatus, setTaskStatus] = useState({});
  const [attendance, setAttendance] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => onSnapshot(
    doc(db, 'students', user.uid),
    (snapshot) => {
      if (snapshot.exists()) {
        setStudent(snapshot.data());
        setProfileError('');
      } else {
        setStudent(null);
        setProfileError('No student profile is linked to this account. Ask your administrator to check the student record.');
      }
    },
    (error) => setProfileError(errText(error)),
  ), [user.uid]);

  useEffect(() => onSnapshot(
    query(collection(db, 'tasks'), where('assignedTo', 'array-contains', user.uid)),
    (snapshot) => setTasks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => setMessage(errText(error)),
  ), [user.uid]);

  useEffect(() => onSnapshot(
    collection(db, 'students', user.uid, 'taskStatus'),
    (snapshot) => setTaskStatus(Object.fromEntries(snapshot.docs.map((item) => [item.id, !!item.data().done]))),
    (error) => setMessage(errText(error)),
  ), [user.uid]);

  useEffect(() => onSnapshot(
    collection(db, 'students', user.uid, 'attendance'),
    (snapshot) => setAttendance(snapshot.docs.map((item) => item.data()).sort((a, b) => b.date.localeCompare(a.date))),
    (error) => setMessage(errText(error)),
  ), [user.uid]);

  useEffect(() => onSnapshot(
    query(collection(db, 'students', user.uid, 'achievements'), orderBy('createdAt', 'desc')),
    (snapshot) => setAchievements(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => setMessage(errText(error)),
  ), [user.uid]);

  const toggleTask = async (taskId) => {
    setMessage('');
    try {
      await setDoc(doc(db, 'students', user.uid, 'taskStatus', taskId), {
        done: !taskStatus[taskId],
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      setMessage(errText(error));
    }
  };

  if (profileError) {
    return <div className="center"><div className="card login">
      <h1>Student account</h1><p className="err">{profileError}</p>
      <button onClick={() => signOut(auth)}>Sign out</button>
    </div></div>;
  }

  return (
    <div className="user-shell">
      <nav className="user-topbar">
        <h1>StudentPortal</h1>
        <span>{student?.name || 'Loading profile…'}</span>
        <button onClick={() => signOut(auth)}><Icon name="logout" size={16} /> Sign out</button>
      </nav>
      <main>
        <h2>Welcome, {student?.name || 'student'}</h2>
        {student && <p className="note">Username: {student.username || student.email?.split('@')[0]} · Roll no: {student.rollNo || '—'} · {student.department || '—'} · Year {student.year || '—'}</p>}
        {message && <p className="err">{message}</p>}
        <h3>My tasks</h3>
        {!tasks.length && <p className="note">No tasks assigned yet.</p>}
        {tasks.map((task) => (
          <label className="card row" key={task.id}>
            <input type="checkbox" checked={!!taskStatus[task.id]} onChange={() => toggleTask(task.id)} />
            <span><b>{task.title}</b>{task.description && <span> — {task.description}</span>}</span>
          </label>
        ))}
        <h3>Attendance</h3>
        {!attendance.length && <p className="note">No attendance records yet.</p>}
        {attendance.map((record) => <p className="card" key={record.date}>{record.date}: {record.status}</p>)}
        <h3>Achievements</h3>
        {!achievements.length && <p className="note">No achievements yet.</p>}
        {achievements.map((achievement) => (
          <div className="card" key={achievement.id}>
            <b>{achievement.title}</b>
            {achievement.summary && <p>{achievement.summary}</p>}
            {achievement.link && <a href={achievement.link} target="_blank" rel="noreferrer">Link</a>}
            {achievement.pdfUrl && <a href={achievement.pdfUrl} target="_blank" rel="noreferrer">{achievement.pdfName || 'PDF'}</a>}
          </div>
        ))}
      </main>
    </div>
  );
}

function FirebaseSetup() {
  return (
    <div className="center">
      <section className="card setup">
        <h1>StudentPortal setup required</h1>
        <p>
          This deployment is missing its Firebase web configuration. Add the variables below
          in your Vercel project to enable sign-in and load student data.
        </p>
        <h2>Missing environment variables</h2>
        <ul>{missingFirebaseConfig.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
        <ol>
          <li>In Vercel, open this project and go to <b>Settings → Environment Variables</b>.</li>
          <li>
            Get each value from <b>Firebase Console → Project settings → General → Your apps</b>,
            under your web app&apos;s Firebase SDK configuration.
          </li>
          <li>
            Add the variables for Production (and Preview if needed), save, then redeploy.
            Vite reads these values when it builds the site.
          </li>
        </ol>
        <p className="note">
          You also need a Firebase project with Email/Password Authentication and Firestore enabled.
          The web config is not an admin key; never put a service-account key in a <code>VITE_</code> variable.
        </p>
      </section>
    </div>
  );
}

function ConfiguredApp() {
  const [user, setUser] = useState(undefined);
  const [admin, setAdmin] = useState(false);
  useEffect(() => onAuthStateChanged(auth, async (u) => {
    const a = u ? !!(await u.getIdTokenResult(true)).claims.admin : false;
    setAdmin(a); setUser(u);
  }), []);
  if (user === undefined) return <p className="center">Loading…</p>;
  if (!user) return <Login />;
  if (!admin) return <StudentPortal user={user} />;
  const adminLinks = [
    ['/', 'Dashboard', 'dashboard'],
    ['/students', 'Students', 'students'],
    ['/attendance', 'Attendance', 'attendance'],
    ['/tasks', 'Tasks', 'tasks'],
    ['/achievements', 'Achievements', 'achievements'],
  ];
  return (
    <BrowserRouter>
      <div className="admin-shell">
        <aside className="sidebar">
          <div className="brand"><span className="brand-mark"><Icon name="shield" size={20} /></span><strong>HRMS Admin Dashboard</strong></div>
          <nav className="side-nav">
            {adminLinks.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === '/'}><Icon name={icon} size={19} /><span>{label}</span></NavLink>))}
          </nav>
          <div className="sidebar-account">
            <span className="avatar">{(auth.currentUser?.email?.[0] || 'A').toUpperCase()}</span>
            <span className="account-name"><strong>{auth.currentUser?.email?.split('@')[0] || 'admin'}</strong><small>Administrator</small></span>
            <button className="sidebar-logout" aria-label="Logout" onClick={() => signOut(auth)}><Icon name="logout" size={17} /></button>
          </div>
        </aside>
        <div className="app-frame">
          <header className="topbar">
            <span>HRMS Admin Dashboard</span>
            <div className="topbar-actions"><span><Icon name="calendar" size={15} />{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span><button onClick={() => signOut(auth)}><Icon name="logout" size={16} /> Logout</button></div>
          </header>
          <main className="admin-main">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/students" element={<Students />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/achievements" element={<Achievements />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return firebaseConfigured ? <ConfiguredApp /> : <FirebaseSetup />;
}
