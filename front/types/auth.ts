export type UserRole = 'user' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}
