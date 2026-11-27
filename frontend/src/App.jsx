import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Navbar from "./components/Navbar";
import Toast from "./components/Toast";
import { EmptyState, Loader } from "./components/UI";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyOtp from "./pages/VerifyOtp";
import ForgotPassword from "./pages/ForgotPassword";
import AdminDashboard from "./pages/AdminDashboard";
import Profile from "./pages/Profile";
import "./App.css";

function Protected({ children, roles }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loader />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(role)) {
    return (
      <EmptyState
        title="Access restricted"
        text="You don't have permission to view this page."
      />
    );
  }

  return children;
}

function App() {
  const { user } = useAuth();

  return (
    <>
      <Navbar />
      {user && <Toast />}

      <main className="container">
        <div className="page">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify" element={<VerifyOtp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/admin" element={<Protected roles={["ADMIN"]}><AdminDashboard /></Protected>} />

            <Route
              path="/profile" element={
                <Protected>
                  <Profile />
                </Protected>
              }
            />
            <Route
              path="*"
              element={
                <EmptyState
                  title="Page not found"
                  text="The page you're looking for doesn't exist or was moved."
                />
              }
            />
          </Routes>
        </div>
      </main>
    </>
  );
}

export default App;
