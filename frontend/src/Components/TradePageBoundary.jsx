import { Component } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

export default class TradePageBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="min-h-screen bg-gray-100 p-6">
        <h1 className="mb-4 text-2xl font-bold">The trading page could not load.</h1>
        <p className="mb-4">Reload to try again, or return to your dashboard.</p>
        <div className="flex flex-wrap items-center gap-4">
          <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={() => window.location.reload()}>Reload page</button>
          <Link className="text-blue-700 underline" to="/dashboard">Return to dashboard</Link>
        </div>
      </section>
    );
  }
}

TradePageBoundary.propTypes = { children: PropTypes.node.isRequired };
