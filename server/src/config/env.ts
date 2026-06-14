import dotenv from 'dotenv';
dotenv.config();

export const env = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/vitalai',
  JWT_SECRET: process.env.JWT_SECRET || 'vitalai-dev-jwt-secret-change-in-production',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'vitalai-dev-refresh-secret-change-in-production',
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  PINECONE_API_KEY: process.env.PINECONE_API_KEY || '',
  PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME || 'vitalai',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
  PORT: parseInt(process.env.PORT || '5000', 10),
};
