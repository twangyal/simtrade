import { Component } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import AppShell from './AppShell';
import Icon from './Icon';

export default class TradePageBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <AppShell section="Trade"><section role="alert" className="panel route-recovery">
        <span className="empty-state-icon"><Icon name="refresh" size={27} /></span>
        <h1>The trading page could not load.</h1>
        <p>Reload to try again, or return to your dashboard.</p>
        <div className="recovery-actions">
          <button className="button button-primary" onClick={() => window.location.reload()}>Reload page</button>
          <Link className="button button-secondary" to="/dashboard">Return to dashboard</Link>
        </div>
      </section></AppShell>
    );
  }
}

TradePageBoundary.propTypes = { children: PropTypes.node.isRequired };
