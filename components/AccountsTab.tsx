// src/tabs/AccountsTab.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { UserRecord, TabCode } from '../types';
import { addUser, deleteUser, listUsers, setPassword, updateUser } from '../services/api';

const TAB_CHOICES: { code: TabCode; label: string }[] = [
  { code: 'CONFIG', label: 'Cấu hình' },
  { code: 'DATA_ENTRY', label: 'Nhập liệu' },
  { code: 'GIFTS', label: 'Quà tặng' },
  { code: 'PRESENTATION', label: 'Trình chiếu' },
  { code: 'ACCOUNTS', label: 'Tài khoản' },
];

function safeUpper(s: any) {
  return String(s || '').trim().toUpperCase();
}

function parseAllowedTabs(raw: any): Set<string> {
  const set = new Set<string>();
  String(raw || '')
    .split(',')
    .map((x) => safeUpper(x))
    .filter(Boolean)
    .forEach((x) => set.add(x));
  return set;
}

function setToAllowedTabs(set: Set<string>): string {
  return Array.from(set.values()).join(',');
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

type EditModel = {
  username: string;
  full_name: string;
  role: 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'DISABLED';
  allowed_tabs: Set<string>;
  valid_from: string;
  valid_to: string;
};

function toEditModel(u?: UserRecord): EditModel {
  const role = safeUpper(u?.role) === 'ADMIN' ? 'ADMIN' : 'USER';
  const status = safeUpper(u?.status) === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
  const tabs = parseAllowedTabs(u?.allowed_tabs);

  // Mặc định USER chỉ có DATA_ENTRY nếu chưa có gì
  if (role === 'USER' && tabs.size === 0) tabs.add('DATA_ENTRY');

  // ADMIN thì mặc định full tab (nhưng vẫn cho chỉnh)
  if (role === 'ADMIN' && tabs.size === 0) {
    TAB_CHOICES.forEach((t) => tabs.add(t.code));
  }

  return {
    username: String(u?.username || '').trim(),
    full_name: String(u?.full_name || '').trim(),
    role,
    status,
    allowed_tabs: tabs,
    valid_from: String(u?.valid_from || '').trim(),
    valid_to: String(u?.valid_to || '').trim(),
  };
}

export default function AccountsTab() {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [err, setErr] = useState<string>('');

  const [mode, setMode] = useState<'none' | 'add' | 'edit' | 'password'>('none');
  const [selected, setSelected] = useState<UserRecord | null>(null);

  // form fields
  const [form, setForm] = useState<EditModel>(() => toEditModel());
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');

  const refresh = async () => {
    setErr('');
    setLoading(true);
    try {
      const list = await listUsers();
      // sort admin first, then username
      const sorted = [...list].sort((a, b) => {
        const ra = safeUpper(a.role) === 'ADMIN' ? 0 : 1;
        const rb = safeUpper(b.role) === 'ADMIN' ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return String(a.username || '').localeCompare(String(b.username || ''));
      });
      setUsers(sorted);
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : 'Không tải được danh sách tài khoản');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const selectedUsername = useMemo(() => selected?.username || '', [selected]);

  const openAdd = () => {
    setSelected(null);
    setForm(toEditModel({ username: '', full_name: '', role: 'USER', allowed_tabs: 'DATA_ENTRY', status: 'ACTIVE' }));
    setNewPassword('');
    setNewPassword2('');
    setMode('add');
  };

  const openEdit = (u: UserRecord) => {
    setSelected(u);
    setForm(toEditModel(u));
    setNewPassword('');
    setNewPassword2('');
    setMode('edit');
  };

  const openPassword = (u: UserRecord) => {
    setSelected(u);
    setNewPassword('');
    setNewPassword2('');
    setMode('password');
  };

  const closeModal = () => {
    setMode('none');
    setSelected(null);
    setNewPassword('');
    setNewPassword2('');
  };

  const toggleTab = (code: TabCode) => {
    const next = new Set(form.allowed_tabs);
    if (next.has(code)) next.delete(code);
    else next.add(code);

    // USER: bắt buộc có DATA_ENTRY
    if (form.role === 'USER' && !next.has('DATA_ENTRY')) next.add('DATA_ENTRY');

    setForm({ ...form, allowed_tabs: next });
  };

  const onChangeRole = (role: 'ADMIN' | 'USER') => {
    const next = new Set(form.allowed_tabs);

    if (role === 'USER') {
      // USER: mặc định chỉ DATA_ENTRY nếu đang rỗng
      if (next.size === 0) next.add('DATA_ENTRY');
      // USER: không tự động cho ACCOUNTS (nhưng admin có thể tick nếu muốn)
      if (!next.has('DATA_ENTRY')) next.add('DATA_ENTRY');
    } else {
      // ADMIN: nếu đang rỗng thì set full
      if (next.size === 0) TAB_CHOICES.forEach((t) => next.add(t.code));
    }

    setForm({ ...form, role, allowed_tabs: next });
  };

  const submitAdd = async () => {
    setErr('');
    const username = String(form.username || '').trim();
    if (!username) return setErr('Thiếu username');
    if (username.includes(' ')) return setErr('Username không được có khoảng trắng');

    if (!newPassword || newPassword.length < 4) return setErr('Mật khẩu tối thiểu 4 ký tự');
    if (newPassword !== newPassword2) return setErr('Nhập lại mật khẩu không khớp');

    setLoading(true);
    try {
      await addUser({
        username,
        password: newPassword,
        full_name: String(form.full_name || '').trim(),
        role: form.role,
        allowed_tabs: setToAllowedTabs(form.allowed_tabs),
        status: form.status,
        valid_from: String(form.valid_from || '').trim(),
        valid_to: String(form.valid_to || '').trim(),
      });
      closeModal();
      await refresh();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : 'Tạo tài khoản thất bại');
    } finally {
      setLoading(false);
    }
  };

  const submitEdit = async () => {
    setErr('');
    const username = String(form.username || '').trim();
    if (!username) return setErr('Thiếu username');

    setLoading(true);
    try {
      await updateUser({
        username,
        full_name: String(form.full_name || '').trim(),
        role: form.role,
        allowed_tabs: setToAllowedTabs(form.allowed_tabs),
        status: form.status,
        valid_from: String(form.valid_from || '').trim(),
        valid_to: String(form.valid_to || '').trim(),
      });
      closeModal();
      await refresh();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : 'Cập nhật thất bại');
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async () => {
    setErr('');
    const username = String(selectedUsername || '').trim();
    if (!username) return setErr('Thiếu username');

    if (!newPassword || newPassword.length < 4) return setErr('Mật khẩu tối thiểu 4 ký tự');
    if (newPassword !== newPassword2) return setErr('Nhập lại mật khẩu không khớp');

    setLoading(true);
    try {
      await setPassword(username, newPassword);
      closeModal();
      await refresh();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : 'Đổi mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  };

  const doDelete = async (u: UserRecord) => {
    setErr('');
    const username = String(u.username || '').trim();
    if (!username) return;

    if (username.toLowerCase() === 'admin') {
      setErr('Không cho phép xoá tài khoản admin');
      return;
    }

    const ok = window.confirm(`Xoá tài khoản "${username}"?`);
    if (!ok) return;

    setLoading(true);
    try {
      await deleteUser(username);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : 'Xoá thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Tài khoản</h2>
        <button onClick={openAdd} style={{ marginLeft: 'auto' }}>
          + Thêm tài khoản
        </button>
        <button onClick={refresh} disabled={loading}>
          {loading ? 'Đang tải...' : 'Tải lại'}
        </button>
      </div>

      {err ? <div style={{ color: 'crimson', marginTop: 10 }}>{err}</div> : null}

      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ borderBottom: '1px solid #ddd', padding: 8 }}>Username</th>
              <th style={{ borderBottom: '1px solid #ddd', padding: 8 }}>Họ tên</th>
              <th style={{ borderBottom: '1px solid #ddd', padding: 8 }}>Role</th>
              <th style={{ borderBottom: '1px solid #ddd', padding: 8 }}>Quyền tab</th>
              <th style={{ borderBottom: '1px solid #ddd', padding: 8 }}>Trạng thái</th>
              <th style={{ borderBottom: '1px solid #ddd', padding: 8 }}>Hiệu lực</th>
              <th style={{ borderBottom: '1px solid #ddd', padding: 8 }}>Last login</th>
              <th style={{ borderBottom: '1px solid #ddd', padding: 8, width: 260 }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.username}>
                <td style={{ borderBottom: '1px solid #eee', padding: 8, fontWeight: 600 }}>{u.username}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{u.full_name || ''}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{u.role || ''}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{u.allowed_tabs || ''}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{u.status || ''}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>
                  {(u.valid_from || '') && (u.valid_to || '')
                    ? `${u.valid_from} → ${u.valid_to}`
                    : u.valid_from
                    ? `Từ ${u.valid_from}`
                    : u.valid_to
                    ? `Đến ${u.valid_to}`
                    : ''}
                </td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{u.last_login || ''}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => openEdit(u)}>Sửa</button>
                    <button onClick={() => openPassword(u)}>Đổi pass</button>
                    <button onClick={() => doDelete(u)} disabled={String(u.username || '').toLowerCase() === 'admin'}>
                      Xoá
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 10, opacity: 0.75 }}>
                  Chưa có tài khoản.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {mode !== 'none' ? (
        <div
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 9999,
          }}
          onClick={closeModal}
        >
          <div
            style={{ width: 'min(720px, 100%)', background: '#fff', borderRadius: 12, padding: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>
                {mode === 'add' ? 'Thêm tài khoản' : mode === 'edit' ? 'Sửa tài khoản' : 'Đổi mật khẩu'}
              </h3>
              <button onClick={closeModal} style={{ marginLeft: 'auto' }}>
                Đóng
              </button>
            </div>

            {mode === 'password' ? (
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                <div style={{ opacity: 0.85 }}>
                  Username: <b>{selectedUsername}</b>
                </div>

                <input
                  placeholder="Mật khẩu mới"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <input
                  placeholder="Nhập lại mật khẩu mới"
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                />

                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <button onClick={submitPassword} disabled={loading}>
                    {loading ? 'Đang lưu...' : 'Lưu mật khẩu'}
                  </button>
                  <button onClick={closeModal}>Huỷ</button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Username</div>
                    <input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="vd: nhaplieu1"
                      disabled={mode === 'edit'}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Họ tên</div>
                    <input
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                      placeholder="Họ và tên"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Role</div>
                    <select value={form.role} onChange={(e) => onChangeRole(e.target.value as any)}>
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Trạng thái</div>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="DISABLED">DISABLED</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Quyền tab</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {TAB_CHOICES.map((t) => (
                      <label key={t.code} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={form.allowed_tabs.has(t.code)}
                          onChange={() => toggleTab(t.code)}
                        />
                        {t.label} <span style={{ opacity: 0.7 }}>({t.code})</span>
                      </label>
                    ))}
                  </div>
                  {form.role === 'USER' ? (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                      * USER luôn có tối thiểu tab <b>DATA_ENTRY</b>
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>valid_from (YYYY-MM-DD)</div>
                    <input
                      value={form.valid_from}
                      onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                      placeholder="vd: 2026-02-09"
                    />
                    <button
                      onClick={() => setForm({ ...form, valid_from: todayIsoDate() })}
                      style={{ marginTop: 6 }}
                      type="button"
                    >
                      Hôm nay
                    </button>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>valid_to (YYYY-MM-DD)</div>
                    <input
                      value={form.valid_to}
                      onChange={(e) => setForm({ ...form, valid_to: e.target.value })}
                      placeholder="vd: 2027-02-09"
                    />
                    <button
                      onClick={() => setForm({ ...form, valid_to: '' })}
                      style={{ marginTop: 6 }}
                      type="button"
                    >
                      Xoá ngày
                    </button>
                  </div>

                  {mode === 'add' ? (
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Mật khẩu</div>
                      <input
                        placeholder="Mật khẩu"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <input
                        placeholder="Nhập lại mật khẩu"
                        type="password"
                        value={newPassword2}
                        onChange={(e) => setNewPassword2(e.target.value)}
                        style={{ marginTop: 6 }}
                      />
                    </div>
                  ) : (
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      (Đổi mật khẩu dùng nút <b>Đổi pass</b>)
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  {mode === 'add' ? (
                    <button onClick={submitAdd} disabled={loading}>
                      {loading ? 'Đang lưu...' : 'Tạo tài khoản'}
                    </button>
                  ) : (
                    <button onClick={submitEdit} disabled={loading}>
                      {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  )}
                  <button onClick={closeModal}>Huỷ</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
