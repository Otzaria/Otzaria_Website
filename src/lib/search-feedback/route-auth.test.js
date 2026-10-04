import {describe,it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({session:null,user:null,connect:vi.fn()}));
vi.mock('next-auth',()=>({getServerSession:async()=>m.session}));
vi.mock('@/app/api/auth/[...nextauth]/route',()=>({authOptions:{}}));
vi.mock('@/lib/db',()=>({default:m.connect}));
vi.mock('@/models/User',()=>({default:{findById:()=>({select:()=>({lean:async()=>m.user})})}}));
import {requireSearchFeedbackAccess} from './route-auth';
describe('search feedback administrator authorization',()=>{
 beforeEach(()=>{m.session=null;m.user=null;m.connect.mockClear();});
 it('unauthenticated401 before DB',async()=>{const r=await requireSearchFeedbackAccess();expect(r.response.status).toBe(401);expect(m.connect).not.toHaveBeenCalled();});
 it('session admin revoked in liveDB denied403',async()=>{m.session={user:{id:'user-id',role:'admin'}};m.user={role:'user'};expect((await requireSearchFeedbackAccess()).response.status).toBe(403);});
 it('trainer allowed only from liveDB',async()=>{m.session={user:{id:'user-id',role:'user'}};m.user={role:'model_trainer'};expect(await requireSearchFeedbackAccess()).toEqual({ok:true});});
 it('deleteduser denied403',async()=>{m.session={user:{id:'user-id',role:'admin'}};expect((await requireSearchFeedbackAccess()).response.status).toBe(403);});
 it('live admin allowed',async()=>{m.session={user:{id:'user-id'}};m.user={role:'admin'};expect(await requireSearchFeedbackAccess()).toEqual({ok:true});});
});
