import { User, Shield, Key } from 'lucide-react';

export default function ProfilePage({ user }) {
  return (
    <div className="profile-page">
      <div className="page-header">
        <h1>User Profile</h1>
        <p>Manage your account details and preferences.</p>
      </div>

      <div className="card mt-24" style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--gold), #B8962E)',
            color: 'var(--bg-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem', fontWeight: '800',
            boxShadow: 'var(--shadow-gold)'
          }}>
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style={{ marginBottom: '4px' }}>{user.username}</h2>
            <div className="tag tag-gold">Member</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="holding-row" style={{ padding: '16px' }}>
            <User size={20} className="muted" />
            <div style={{ flex: 1 }}>
              <div className="input-label" style={{ marginBottom: '2px' }}>Username</div>
              <div style={{ fontWeight: '500' }}>{user.username}</div>
            </div>
          </div>
          <div className="holding-row" style={{ padding: '16px' }}>
            <Key size={20} className="muted" />
            <div style={{ flex: 1 }}>
              <div className="input-label" style={{ marginBottom: '2px' }}>User ID</div>
              <div style={{ fontWeight: '500' }}>{user.user_id}</div>
            </div>
          </div>
          <div className="holding-row" style={{ padding: '16px' }}>
            <Shield size={20} className="muted" />
            <div style={{ flex: 1 }}>
              <div className="input-label" style={{ marginBottom: '2px' }}>Account Status</div>
              <div style={{ fontWeight: '500', color: 'var(--green)' }}>Active</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
