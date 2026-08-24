import React, { useState } from 'react';
import { useLogin } from '@workspace/api-client-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'wouter';
import { Eye, EyeOff, ScanFace } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { useToast } from '../hooks/use-toast';
import { isFaceIdSupported, loginWithFace } from '../lib/face-id';
import { DAVOMAT_GEOFENCE_METERS } from '../lib/davomat-api';
import { FaceScanDialog } from '../components/FaceScanDialog';
import type { User } from '@workspace/api-client-react';
import { compactCredential } from '../lib/utils';

export default function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);
  const { mutate, isPending } = useLogin();
  const { switchToUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const goAfterLogin = (user: User) => {
    switchToUser(user);
    setLocation(user.role === 'stajyor' ? '/kirish' : '/dashboard');
  };

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const loginTrim = compactCredential(login);
    const passwordTrim = compactCredential(password);
    if (loginTrim !== login) setLogin(loginTrim);
    if (passwordTrim !== password) setPassword(passwordTrim);
    if (!loginTrim || !passwordTrim) return;

    mutate({ data: { login: loginTrim, password: passwordTrim } }, {
      onSuccess: (data) => {
        goAfterLogin(data.user);
      },
      onError: (err) => {
        const data = (err as { data?: { error?: string }; message?: string } | undefined)?.data;
        const msg =
          (typeof data?.error === 'string' && data.error) ||
          (typeof (err as { message?: string })?.message === 'string'
            ? String((err as { message?: string }).message).replace(/^HTTP \d+ [^:]+:\s*/, '')
            : null) ||
          "Login yoki parol noto'g'ri";
        toast({
          title: 'Xatolik',
          description: msg,
          variant: 'destructive',
        });
      }
    });
  };

  const demoAccounts = [
    { label: "Admin", login: "admin", pass: "admin123" },
    { label: "Rekruter", login: "recruiter1", pass: "pass123" },
    { label: "HR", login: "hr1", pass: "pass123" },
    { label: "Trener", login: "trainer1", pass: "pass123" },
    { label: "Direktor", login: "director1", pass: "pass123" },
    { label: "Bo'lim boshlig'i", login: "dept_head1", pass: "pass123" },
    { label: "Mudir", login: "mudir1", pass: "pass123" },
    { label: "Koordinator", login: "koordinator1", pass: "pass123" },
    { label: "Farmasevt", login: "farmasevt1", pass: "pass123" },
    { label: "Stajyor", login: "stajyor1", pass: "pass123" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src={`${import.meta.env.BASE_URL}logo3d.png`}
            alt="VAKSINA MED HR"
            className="mx-auto h-28 w-auto max-w-full object-contain sm:h-36"
          />
        </div>

        <Card className="border-t-4 border-t-primary shadow-xl">
          <CardHeader>
            <CardTitle>Tizimga kirish</CardTitle>
            <CardDescription>
              O'z profilingizga kirish uchun ma'lumotlarni kiriting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login">Login</Label>
                <Input 
                  id="login" 
                  value={login} 
                  onChange={(e) => setLogin(compactCredential(e.target.value))}
                  onBlur={() => setLogin((v) => compactCredential(v))}
                  onPaste={(e) => {
                    e.preventDefault();
                    setLogin(compactCredential(e.clipboardData.getData('text')));
                  }}
                  placeholder="Loginni kiriting"
                  autoComplete="username"
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Parol</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(compactCredential(e.target.value))}
                    onBlur={() => setPassword((v) => compactCredential(v))}
                    onPaste={(e) => {
                      e.preventDefault();
                      setPassword(compactCredential(e.clipboardData.getData('text')));
                    }}
                    placeholder="Parolni kiriting"
                    className="pr-10"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Parolni yashirish' : "Parolni ko'rsatish"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isPending || faceOpen}>
                {isPending ? 'Kirilmoqda...' : 'Kirish'}
              </Button>
            </form>
            {isFaceIdSupported() ? (
              <div className="mt-4">
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-muted-foreground">yoki</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={isPending || faceOpen}
                  onClick={() => setFaceOpen(true)}
                >
                  <ScanFace className="h-4 w-4" />
                  Face ID bilan kirish
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 w-full gap-2"
                  onClick={() => setLocation("/davomat-face")}
                >
                  <ScanFace className="h-4 w-4" />
                  Davomat
                </Button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Davomat: farmasevt, mudir va stajyor — o‘z filiali GPS ({DAVOMAT_GEOFENCE_METERS} m). Qolganlar — asosiy ofis.
                </p>
                <FaceScanDialog
                  open={faceOpen}
                  onOpenChange={setFaceOpen}
                  mode="login"
                  onCaptured={async (descriptor, snapshot, liveness) => {
                    const data = await loginWithFace<User>(descriptor, snapshot, liveness);
                    const fullName =
                      data.fullName ||
                      (data.user as User & { fullName?: string })?.fullName ||
                      "";
                    if (data.user) {
                      switchToUser(data.user);
                    }
                    // Dialog ismni ko‘rsatishi uchun biroz kutamiz
                    window.setTimeout(() => {
                      toast({
                        title: fullName ? `Xush kelibsiz, ${fullName}` : "Face ID",
                        description: fullName
                          ? "Yuz aniqlandi — shu profilga kirdingiz"
                          : "Tizimga kirdingiz",
                      });
                      if (data.user) goAfterLogin(data.user);
                    }, 900);
                    return { fullName };
                  }}
                />
              </div>
            ) : null}
          </CardContent>
          
          {import.meta.env.DEV && (
            <CardFooter className="flex flex-col items-stretch pt-0 border-t mt-6 bg-gray-50/50">
              <div className="text-sm font-medium text-center text-gray-500 py-4">
                Demo akkauntlar (tanlang):
              </div>
              <div className="grid grid-cols-2 gap-2 pb-4">
                {demoAccounts.map((acc) => (
                  <Button
                    key={acc.login}
                    variant="outline"
                    size="sm"
                    className="justify-start text-xs h-8"
                    onClick={() => {
                      setLogin(acc.login);
                      setPassword(acc.pass);
                      setTimeout(() => {
                        mutate(
                          { data: { login: acc.login, password: acc.pass } },
                          {
                            onSuccess: (data) => {
                              switchToUser(data.user);
                              setLocation(
                                data.user.role === 'stajyor' ? '/kirish' : '/dashboard',
                              );
                            },
                          },
                        );
                      }, 100);
                    }}
                  >
                    {acc.label}
                  </Button>
                ))}
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
