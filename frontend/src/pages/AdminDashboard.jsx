import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { formatDate, getDeadline, getPhase, PHASES } from "../utils";
import { PageHeader } from "../components/UI";

const emptyHackathon = {
  title: "",
  description: "",
  theme: "",
  location: "",
  mode: "ONLINE",
  startDate: "",
  endDate: "",
  regDeadline: "",
  maxTeamSize: 4,
};

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [hackathons, setHackathons] = useState([]);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState(null);
  const [form, setForm] = useState(emptyHackathon);
  const [showForm, setShowForm] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function loadAll() {
    const s = await api("/dashboard/admin");
    if (s.ok) setStats(s.data);
    const h = await api("/hackathons");
    if (h.ok) setHackathons(h.data);
    const u = await api("/users");
    if (u.ok) setUsers(u.data);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function run(path, method, body, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setMsg("");
    setError("");
    const res = await api(path, method, body);
    if (res.ok) {
      setMsg(res.message);
      loadAll();
    } else {
      setError(res.message);
    }
  }

  async function createHackathon(e) {
    e.preventDefault();
    setMsg("");
    setError("");
    if (!form.title || !form.description || !form.startDate || !form.endDate || !form.regDeadline) {
      setError("Please fill title, description and all dates");
      return;
    }
    const body = {
      ...form,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      regDeadline: new Date(form.regDeadline).toISOString(),
      maxTeamSize: parseInt(form.maxTeamSize),
    };
    const res = await api("/hackathons", "POST", body);
    if (res.ok) {
      setMsg("Hackathon created");
      setForm(emptyHackathon);
      setShowForm(false);
      loadAll();
    } else {
      setError(res.message);
    }
  }

  function nextPhase(h) {
    const next = PHASES[PHASES.indexOf(getPhase(h)) + 1];
    let text = "Move " + h.title + " to " + next + "?";
    if (next === "CHECK_IN") text += " Registrations will close and all teams will be locked.";
    run("/hackathons/" + h.id + "/phase", "PUT", { phase: next }, text);
  }

  async function loadLogs() {
    if (logs) {
      setLogs(null);
      return;
    }
    const res = await api("/audit-logs?limit=100");
    if (res.ok) setLogs(res.data);
    else setError(res.message);
  }

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.username || "").includes(userSearch.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="Manage hackathons, users and platform activity." />

      {stats && (
        <div className="stats">
          <div className="stat"><h4>{stats.users.total}</h4><p>Total Users</p></div>
          <div className="stat"><h4>{stats.users.participants}</h4><p>Participants</p></div>
          <div className="stat"><h4>{stats.users.judges}</h4><p>Judges</p></div>
          <div className="stat"><h4>{stats.hackathons.total}</h4><p>Hackathons</p></div>
          <div className="stat"><h4>{stats.teams.total}</h4><p>Teams</p></div>
          <div className="stat"><h4>{stats.teams.locked}</h4><p>Locked</p></div>
          <div className="stat"><h4>{stats.teams.checkedIn}</h4><p>Checked in</p></div>
          <div className="stat"><h4>{stats.teams.disqualified}</h4><p>Disqualified</p></div>
          <div className="stat"><h4>{stats.registrations.total}</h4><p>Registrations</p></div>
        </div>
      )}
      {stats && stats.gender && (
        <p className="muted">
          Gender:{" "}
          {Object.keys(stats.gender).map((g) => g + ": " + stats.gender[g]).join(" | ")}
        </p>
      )}

      {msg && <p className="success">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <h3>Hackathons</h3>
      <button onClick={() => setShowForm(!showForm)}>{showForm ? "Close" : "+ New Hackathon"}</button>

      {showForm && (
        <div className="form-box wide">
          <form onSubmit={createHackathon}>
            <label>Title</label>
            <input name="title" value={form.title} onChange={handleChange} />
            <label>Description</label>
            <textarea name="description" rows={3} value={form.description} onChange={handleChange} />
            <label>Theme</label>
            <input name="theme" value={form.theme} onChange={handleChange} />
            <label>Mode</label>
            <select name="mode" value={form.mode} onChange={handleChange}>
              <option value="ONLINE">Online</option>
              <option value="OFFLINE">Offline</option>
              <option value="HYBRID">Hybrid</option>
            </select>
            <label>Location</label>
            <input name="location" value={form.location} onChange={handleChange} />
            <label>Start Date</label>
            <input type="datetime-local" name="startDate" value={form.startDate} onChange={handleChange} />
            <label>End Date</label>
            <input type="datetime-local" name="endDate" value={form.endDate} onChange={handleChange} />
            <label>Registration Deadline</label>
            <input type="datetime-local" name="regDeadline" value={form.regDeadline} onChange={handleChange} />
            <label>Max Team Size (3 - 5)</label>
            <input type="number" min="3" max="5" name="maxTeamSize" value={form.maxTeamSize} onChange={handleChange} />
            <button type="submit">Create</button>
          </form>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Deadline</th>
            <th>Phase</th>
            <th>Registrations</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {hackathons.map((h) => {
            const phase = getPhase(h);
            const open = h.registrationOpen !== false;
            return (
              <tr key={h.id}>
                <td><Link to={"/hackathons/" + h.id}>{h.title}</Link></td>
                <td>{formatDate(getDeadline(h))}</td>
                <td><span className="badge">{phase}</span></td>
                <td>
                  {open ? <span className="badge green">Open</span> : <span className="badge red">Closed</span>}
                </td>
                <td>
                  <Link to={"/admin/hackathons/" + h.id} className="btn btn-small">Manage</Link>
                  {phase !== "COMPLETED" && (
                    <button className="btn-small" onClick={() => nextPhase(h)}>
                      Next: {PHASES[PHASES.indexOf(phase) + 1]}
                    </button>
                  )}
                  {open && phase === "REGISTRATION" && (
                    <button
                      className="btn-small btn-grey"
                      onClick={() =>
                        run("/hackathons/" + h.id + "/close-registration", "POST", null, "Close registrations? Admin cannot reopen them.")
                      }
                    >
                      Close Reg.
                    </button>
                  )}
                  <button
                    className="btn-small btn-danger"
                    onClick={() =>
                      run("/hackathons/" + h.id, "DELETE", null, "This will delete the hackathon with all its teams and data. Continue?")
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Users ({users.length})</h3>
      <input placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} style={{ maxWidth: 300 }} />
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Email</th>
            <th>Gender</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.username || "-"}</td>
              <td>{u.email}</td>
              <td>{u.gender || "-"}</td>
              <td>{u.role}</td>
              <td>
                <button
                  className="btn-small btn-grey"
                  onClick={() => run("/auth/force-logout/" + u.id, "POST", null, "Force logout " + u.name + " from all devices?")}
                >
                  Force Logout
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Audit Logs</h3>
      <button className="btn-grey" onClick={loadLogs}>{logs ? "Hide" : "Show"} Audit Logs</button>
      {logs && (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Who</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{formatDate(l.createdAt)}</td>
                <td>{l.actor ? l.actor.name : "System"}</td>
                <td>{l.action}</td>
                <td><small>{l.details ? JSON.stringify(l.details) : "-"}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminDashboard;
