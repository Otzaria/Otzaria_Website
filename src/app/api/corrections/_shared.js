import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import { handleCorrectionsRequest } from '@/lib/corrections/http';

export const withCorrections = (request, fn, opts = {}) =>
  handleCorrectionsRequest(request, fn, { getSession: () => getServerSession(authOptions), connect: connectDB, ...opts });
