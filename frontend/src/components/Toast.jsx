import { useState } from "react";
import useSocketEvent from "../useSocketEvent";
import { useAuth } from "../AuthContext";

// shows live notifications
function Toast() {
  const [items, setItems] = useState([]);
  const { loadInviteCount } = useAuth();

  function push(item) {
    const id = Date.now() + Math.random();
    setItems((old) => [...old, { id, ...item }]);
    setTimeout(() => {
      setItems((old) => old.filter((i) => i.id !== id));
    }, 6000);
  }

  useSocketEvent("announcement:new", (a) => push({ title: a.title, text: a.message }));
  useSocketEvent("invite:new", (d) => {
    push({ title: "Team invite", text: "You got an invite to join team " + d.teamName });
    loadInviteCount();
  });
  useSocketEvent("invite:cancelled", () => loadInviteCount());

  if (items.length === 0) return null;

  return (
    <div className="toast-box">
      {items.map((i) => (
        // click anywhere on the toast to dismiss it
        <div key={i.id} className="toast" onClick={() => setItems(items.filter((x) => x.id !== i.id))}>
          <div className="toast-body">
            <b>{i.title}</b>
            <span>{i.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default Toast;
