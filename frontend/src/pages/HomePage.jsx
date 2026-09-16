import { Globe, Bitcoin, Landmark } from 'lucide-react';

export default function HomePage({ user, onNavigate }) {
  return (
    <div className="home-page">
      <div className="page-header">
        <h1>Welcome, <span className="gold-text">{user.username}</span></h1>
        <p>Select a market to explore trending assets and opportunities.</p>
      </div>

      <div className="grid-3 mt-24">
        {/* US & Canada */}
        <div className="card card-accent-blue" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--blue-bg)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={24} />
          </div>
          <div>
            <h3 style={{ marginBottom: '8px' }}>US & Canada</h3>
            <p style={{ fontSize: '0.85rem' }}>Explore leading tech, finance, and industrial markets.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
            <button className="btn btn-outline btn-full" onClick={() => onNavigate('market-us-stocks')}>Stocks</button>
            <button className="btn btn-outline btn-full" onClick={() => onNavigate('market-us-etfs')}>ETFs</button>
          </div>
        </div>

        {/* Crypto */}
        <div className="card card-accent-gold" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--gold-bg)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bitcoin size={24} />
          </div>
          <div>
            <h3 style={{ marginBottom: '8px' }}>Cryptocurrency</h3>
            <p style={{ fontSize: '0.85rem' }}>Track Bitcoin, Ethereum, and high-volume digital assets.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
            <button className="btn btn-outline btn-full" onClick={() => onNavigate('market-crypto-all')}>View All Cryptos</button>
          </div>
        </div>

        {/* India */}
        <div className="card card-accent-green" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--green-bg)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Landmark size={24} />
          </div>
          <div>
            <h3 style={{ marginBottom: '8px' }}>Indian Markets</h3>
            <p style={{ fontSize: '0.85rem' }}>Discover fast-growing companies and index funds.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
            <button className="btn btn-outline btn-full" onClick={() => onNavigate('market-india-stocks')}>Stocks</button>
            <button className="btn btn-outline btn-full" onClick={() => onNavigate('market-india-etfs')}>ETFs</button>
          </div>
        </div>
      </div>
    </div>
  );
}
