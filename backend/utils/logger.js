const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
  },
  
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
  }
};

const serverColors = {
  'BALANCER': colors.fg.blue,
  'SERVER-1': colors.fg.green,
  'SERVER-2': colors.fg.yellow,
  'SERVER-3': colors.fg.magenta,
  'database': colors.fg.cyan,
  'default': colors.fg.white
};

class Logger {
  constructor() {
    this.serverName = 'default';
  }

  setServerName(name) {
    this.serverName = name;
  }

  getColor(type) {
    return serverColors[type] || serverColors['default'];
  }

  formatMessage(message, level, type) {
    const timestamp = new Date().toISOString();
    const color = this.getColor(type || this.serverName);
    const levelColor = this.getLevelColor(level);
    
    return `${color}[${type || this.serverName}]${colors.reset} ${levelColor}[${level.toUpperCase()}]${colors.reset} ${timestamp} - ${message}`;
  }

  getLevelColor(level) {
    switch(level) {
      case 'error': return colors.fg.red;
      case 'warn': return colors.fg.yellow;
      case 'success': return colors.fg.green;
      case 'info': return colors.fg.cyan;
      default: return colors.fg.white;
    }
  }

  info(message, type) {
    console.log(this.formatMessage(message, 'info', type));
  }

  error(message, type) {
    console.error(this.formatMessage(message, 'error', type));
  }

  warn(message, type) {
    console.warn(this.formatMessage(message, 'warn', type));
  }

  success(message, type) {
    console.log(this.formatMessage(message, 'success', type));
  }

  request(method, url, serverInfo, statusCode) {
    const statusColor = statusCode < 400 ? colors.fg.green : colors.fg.red;
    const message = `${method} ${url} - ${statusColor}${statusCode}${colors.reset}`;
    console.log(this.formatMessage(message, 'info', serverInfo));
  }
}

module.exports = new Logger();