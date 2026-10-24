import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Admin() {
  const [adminSession, setAdminSession] = useState(sessionStorage.getItem('admin_token'));
  const [pwd, setPwd] = useState('');
  const [activeTab, setActiveTab] = useState<'settings' | 'pins' | 'orders'>('settings');
  
  const [announcement, setAnnouncement] = useState('');
  const [ig, setIg] = useState('');
  const [menuOpts, setMenuOpts] = useState<{ [key: string]: boolean }>({ A: true, B: true, C: true, D: true });

  const [students, setStudents] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [sortField, setSortField] = useState<'seat_number' | 'created_at' | 'paid_at'>('seat_number');
  const [sortAsc, setSortAsc] = useState(true);

  const navigate = useNavigate();

  // 讀取最新設定（讓管理員進後台時能看到目前的設定內容）
  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from('daily_settings')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setAnnouncement(data.announcement || '');
      setIg(data.ig_account || '');
      setMenuOpts(data.menu_options || { A: true, B: true, C: true, D: true });
    }
  }, []);

  const fetchStudents = async () => {
    const { data } = await supabase.from('public_student_status').select('*');
    if (data) setStudents(data);
  };

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase.from('today_orders_view').select('*');
    if (data) setOrders(data);
  }, []);

  useEffect(() => {
    if (adminSession) {
      if (activeTab === 'settings') fetchSettings();
      if (activeTab === 'pins') fetchStudents();
      if (activeTab === 'orders') fetchOrders();
    }
  }, [adminSession, activeTab, fetchSettings, fetchOrders]);

  const handleLogin = async () => {
    const { data, error } = await supabase.rpc('admin_login', { p_password: pwd });
    if (error) alert(error.message);
    else {
      sessionStorage.setItem('admin_token', data);
      setAdminSession(data);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const { error } = await supabase.rpc('admin_update_settings', {
        p_admin_session: adminSession,
        p_announcement: announcement,
        p_price: 85, // 固定為 85 元
        p_ig: ig,
        p_options: menuOpts
      });
      if (error) throw new Error(error.message);
      alert('設定已成功儲存！');
    } catch (err: any) {
      alert('儲存失敗: ' + err.message);
    }
  };

  const handleResetPin = async (seat: number) => {
    if (window.confirm(`確定要重設 ${seat} 號的 PIN 碼嗎？`)) {
      const { error } = await supabase.rpc('admin_reset_pin', { p_admin_session: adminSession, p_seat: seat });
      if (error) alert('重設失敗: ' + error.message);
      else { alert('已重設。'); fetchStudents(); }
    }
  };

  const handleDeleteOrder = async (orderId: string, seatNumber: number) => {
    if (window.confirm(`【管理員權限】確定要強制刪除座號 ${seatNumber} 的訂單嗎？`)) {
      try {
        const { error } = await supabase.rpc('admin_delete_order', {
          p_admin_session: adminSession,
          p_order_id: orderId
        });
        if (error) throw new Error(error.message);
        alert('訂單已刪除');
        fetchOrders();
      } catch (err: any) {
        alert('刪除失敗: ' + err.message);
      }
    }
  };

  const handleSort = (field: 'seat_number' | 'created_at' | 'paid_at') => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const sortedOrders = [...orders].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (sortField === 'paid_at') {
      if (!valA) return 1;
      if (!valB) return -1;
    }

    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  if (!adminSession) {
    return (
      <div className="flex flex-col min-h-screen p-6 justify-center bg-slate-900 text-white">
        <h1 className="text-2xl font-bold mb-6 text-center">管理員登入</h1>
        <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="輸入管理員密碼" className="w-full p-4 rounded-xl text-slate-900 mb-4" />
        <button onClick={handleLogin} className="w-full bg-blue-600 p-4 rounded-xl font-bold">登入後台</button>
        <button onClick={() => navigate('/')} className="mt-6 text-slate-400">返回學生版</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="font-bold text-lg">後台管理</h1>
        <button onClick={() => { sessionStorage.removeItem('admin_token'); setAdminSession(null); }} className="text-sm bg-slate-700 px-3 py-1 rounded">登出</button>
      </header>

      <div className="flex border-b bg-white">
        {['settings', 'pins', 'orders'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-3 text-sm font-medium ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`}>
            {tab === 'settings' ? '每日設定' : tab === 'pins' ? 'PIN管理' : '訂單清單'}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* 每日設定 (已簡化價格) */}
        {activeTab === 'settings' && (
          <div className="bg-white p-5 rounded-2xl border space-y-4 shadow-sm">
            <div>
              <label className="block text-sm font-bold mb-1">首頁公告</label>
              <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} className="w-full p-3 border rounded-xl" rows={3} />
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">駐校廠商 IG 帳號</label>
              <input type="text" value={ig} onChange={(e) => setIg(e.target.value)} className="w-full p-3 border rounded-xl" placeholder="例如: 117_lunch" />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">開放餐點選項</label>
              <div className="flex gap-4">
                {['A', 'B', 'C', 'D'].map(m => (
                  <label key={m} className="flex items-center gap-1">
                    <input type="checkbox" checked={menuOpts[m] !== false} onChange={(e) => setMenuOpts({ ...menuOpts, [m]: e.target.checked })} className="w-5 h-5 text-blue-600" />
                    <span className="font-bold">{m} 餐</span>
                  </label>
                ))}
              </div>
            </div>

            <button onClick={handleSaveSettings} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">儲存變更</button>
          </div>
        )}

        {/* PIN 管理 */}
        {activeTab === 'pins' && (
          <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b"><tr><th className="p-3">座號</th><th className="p-3">狀態</th><th className="p-3">操作</th></tr></thead>
              <tbody className="divide-y">
                {students.map(stu => (
                  <tr key={stu.seat_number}>
                    <td className="p-3 font-bold">{stu.seat_number}</td>
                    <td className="p-3">
                      {stu.is_registered ? <span className="text-green-600 font-bold">已註冊</span> : <span className="text-slate-400">未註冊</span>}
                    </td>
                    <td className="p-3">
                      {stu.is_registered && (
                        <button onClick={() => handleResetPin(stu.seat_number)} className="text-red-500 p-2 bg-red-50 rounded-lg">重設</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 訂單管理 */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-2xl border overflow-hidden shadow-sm overflow-x-auto">
            <p className="p-3 text-xs text-slate-500 bg-slate-50 border-b">點擊標題可切換排序 (藍字為目前排序)</p>
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th onClick={() => handleSort('seat_number')} className={`p-3 cursor-pointer ${sortField === 'seat_number' && 'text-blue-600 font-bold'}`}>
                    座號 {sortField === 'seat_number' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th onClick={() => handleSort('created_at')} className={`p-3 cursor-pointer ${sortField === 'created_at' && 'text-blue-600 font-bold'}`}>
                    點餐時間 {sortField === 'created_at' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th className="p-3">餐點</th>
                  <th onClick={() => handleSort('paid_at')} className={`p-3 cursor-pointer ${sortField === 'paid_at' && 'text-blue-600 font-bold'}`}>
                    付款時間 {sortField === 'paid_at' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th className="p-3">操作者 / 付款人</th>
                  <th className="p-3">管理操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedOrders.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">今天尚無訂單</td></tr>}
                {sortedOrders.map(o => (
                  <tr key={o.id}>
                    <td className="p-3 font-bold">{o.seat_number}</td>
                    <td className="p-3 text-xs">{o.created_time_str || '—'}</td>
                    <td className="p-3 font-bold">{o.meal_id}</td>
                    <td className="p-3 text-xs font-mono">
                      {o.paid_time_str ? <span className="text-green-600">{o.paid_time_str}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-3 text-xs text-slate-500">
                      {o.updater_seat || o.creator_seat} 號 / {o.payer_seat ? `${o.payer_seat} 號` : '—'}
                    </td>
                    <td className="p-3">
                      <button onClick={() => handleDeleteOrder(o.id, o.seat_number)} className="px-2 py-1 bg-red-50 text-red-600 rounded font-medium text-xs">
                        刪除訂單
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}