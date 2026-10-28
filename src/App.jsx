import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, onSnapshot, getDoc, getDocs, doc, addDoc, deleteDoc, setDoc,
  writeBatch, query, orderBy, where, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { auth, db, call, createStudent, firebaseConfigured, missingFirebaseConfig } from './firebase';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const errText = (e) => {
  const messages = {
    'permission-denied': 'Firestore denied access to student records. Check that the Firestore rules are deployed and that you are signed in with the admin account.',
    'unauthenticated': 'Your sign-in has expired. Sign in again and retry.',
    'local-service/unavailable': 'The local Spark admin service is not running. Start it in a second terminal and try again.',
    'invalid-argument': 'Enter a valid student username, password, and name.',
    'already-exists': 'That student username is already in use.',
    'permission-denied-api': 'Only an admin account can add students.',
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
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>StudentPortal</h1>
        <p className="note">Sign in with your username and password.</p>
        <input name="username" type="text" placeholder="Username" autoComplete="username" required />
        <input name="password" type="password" placeholder="Password" required />
        {err && <p className="err">{err}</p>}
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

function Dashboard() {
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
  const Stat = ({ n, l }) => <div className="card stat"><b>{n}</b><span>{l}</span></div>;
  return (
    <>
      <h2>Dashboard</h2>
      {studentsError && <p className="err">{studentsError}</p>}
      <div className="grid">
        <Stat n={students.length} l="Students" />
        <Stat n={tasks} l="Tasks" />
        <Stat n={att.present} l="Present today" />
        <Stat n={att.absent} l="Absent today" />
        <Stat n={att.late} l="Late today" />
        <Stat n={Math.max(students.length - marked, 0)} l="Not marked today" />
      </div>
    </>
  );
}

function Students() {
  const { students, error: studentsError } = useStudents();
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const run = async (fn) => { setMsg(''); try { await fn(); setMsg('Done.'); } catch (e) { setMsg(errText(e)); } };
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
      <p className="note">On Spark, keep the local admin service running in a second terminal to add students. Students sign in with their username; no email inbox is needed. The username is saved in the student profile. The password is managed by Firebase Authentication and is not saved in Firestore.</p>
      <form className="card row" onSubmit={add}>
        <input name="username" placeholder="Student username (login)" autoComplete="username" required />
        <input name="password" type="password" placeholder="Password (min 6)" minLength={6} required />
        <input name="name" placeholder="Full name" required />
        <input name="rollNo" placeholder="Roll no" />
        <input name="department" placeholder="Department" />
        <input name="year" placeholder="Year" />
        <button>Add student</button>
      </form>
      {msg && <p className="note">{msg}</p>}
      <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scroll"><table>
        <thead><tr><th>Roll</th><th>Name</th><th>Dept</th><th>Year</th><th>Login username</th><th></th></tr></thead>
        <tbody>{list.map((s) => (
          <tr key={s.id}>
            <td>{s.rollNo}</td><td>{s.name}</td><td>{s.department}</td><td>{s.year}</td><td>{s.username || s.email?.split('@')[0]}</td>
            <td className="acts">
              <button onClick={() => { const p = prompt('New password (min 6):'); if (p) run(() => call('resetStudentPassword', { uid: s.id, newPassword: p })); }}>Reset pw</button>
              <button onClick={() => run(() => call('setStudentDisabled', { uid: s.id, disabled: true }))}>Disable</button>
              <button onClick={() => run(() => call('setStudentDisabled', { uid: s.id, disabled: false }))}>Enable</button>
              <button className="danger" onClick={() => confirm(`Delete ${s.name} and all their data?`) && run(() => call('deleteStudent', { uid: s.id }))}>Delete</button>
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
    <div className="shell">
      <nav>
        <h1>StudentPortal</h1>
        <span>{student?.name || 'Loading profile…'}</span>
        <button onClick={() => signOut(auth)}>Sign out</button>
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
  return (
    <BrowserRouter>
      <div className="shell">
        <nav>
          <h1>Admin</h1>
          {[['/', 'Dashboard'], ['/students', 'Students'], ['/attendance', 'Attendance'], ['/tasks', 'Tasks'], ['/achievements', 'Achievements']].map(([to, l]) => (
            <NavLink key={to} to={to} end={to === '/'}>{l}</NavLink>))}
          <button onClick={() => signOut(auth)}>Sign out</button>
        </nav>
        <main>
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
    </BrowserRouter>
  );
}

export default function App() {
  return firebaseConfigured ? <ConfiguredApp /> : <FirebaseSetup />;
}
