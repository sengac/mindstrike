import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timest(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mindstrike' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timest({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timest, level, message, ...meta }) => {
          let metaStr = '';
          if (Object.keys(meta).length > 0) {
            metaStr = ' ' + JSON.stringify(meta);
          }
          return `${timest} ${level}: ${message}${metaStr}`;
        })
      )
    })
  ]
});
