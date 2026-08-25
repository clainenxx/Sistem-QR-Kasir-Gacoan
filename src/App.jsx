import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/Navbar'
import AdminNav from './components/AdminNav'
import ProtectedRoute from './components/ProtectedRoute'
import CartPopup from './components/CartPopup'

import Home from './pages/Home'
import ProductDetail from './pages/ProductDetail'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Checkout from './pages/Checkout'
import OrderQR from './pages/OrderQR'

import AdminDashboard from './pages/admin/Dashboard'
import AdminTransactions from './pages/admin/Transactions'
import AdminAddProduct from './pages/admin/AddProduct'
import AdminScanner from './pages/admin/Scanner'
import AdminScanResult from './pages/admin/ScanResult'

// Layout publik: Navbar + popup keranjang, muncul di semua halaman ini
// (termasuk /checkout dan /order/:token) — TAPI TIDAK di /admin/* karena
// AdminLayout di bawah gak render CartPopup sama sekali.
// /login dan /signup TIDAK muncul di Navbar — hanya bisa diakses via URL.
function PublicLayout() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Outlet />
      <CartPopup />
    </div>
  )
}

// Layout admin: TANPA Navbar publik dan TANPA popup keranjang.
function AdminLayout() {
  return (
    <div className="min-h-screen bg-ink text-cream">
      <AdminNav />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order/:token" element={<OrderQR />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="transactions" element={<AdminTransactions />} />
            <Route path="products/new" element={<AdminAddProduct />} />
            <Route path="scanner" element={<AdminScanner />} />
            <Route path="scan-result/:token" element={<AdminScanResult />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
