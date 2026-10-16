/**
 * AuditAI - Configuration File
 * 
 * Automatically switches between local development (http://localhost:5001)
 * and production Render backend URL.
 * Update RENDER_BACKEND_URL with your actual Render deployment URL.
 */

const CONFIG = {
  // Live Render deployment URL
  RENDER_BACKEND_URL: 'https://ml-project-4g7a.onrender.com',

  // Dynamic API Base URL resolver
  get API_BASE_URL() {
    const isLocal = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.protocol === 'file:';
    
    return isLocal ? 'http://localhost:5001' : this.RENDER_BACKEND_URL;
  }
};
