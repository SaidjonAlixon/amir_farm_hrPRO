import React from 'react';
import { useCreateCandidate, useGetVacancies, useGetUsers } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import { PhoneInput } from '../../components/ui/phone-input';
import { isCompleteUzPhone, normalizeUzPhone, UZ_PHONE_HINT } from '../../lib/phone';
import { isHrManager } from '../../lib/roles';

const formSchema = z.object({
  fullName: z.string().min(5, "To'liq ismni kiriting"),
  phone: z
    .string()
    .refine(isCompleteUzPhone, { message: UZ_PHONE_HINT }),
  vacancyId: z.coerce.number({ required_error: "Ish o'rnini tanlang" }).min(1, "Ish o'rnini tanlang"),
  recruiterId: z.coerce.number().optional(),
  birthDate: z.string().optional(),
  address: z.string().optional(),
  education: z.string().optional(),
  experience: z.string().optional(),
  expectedSalary: z.string().optional(),
  notes: z.string().optional(),
});

export default function NewCandidate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { mutate, isPending } = useCreateCandidate();

  const canAdd =
    user?.role === 'recruiter' ||
    isHrManager(user?.role) ||
    user?.role === 'director';

  const { data: vacancies, isLoading: vacsLoading } = useGetVacancies({ status: 'published' });
  const { data: recruiters, isLoading: recsLoading } = useGetUsers({ role: 'recruiter' });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      vacancyId: undefined as unknown as number,
      recruiterId: user?.role === 'recruiter' ? user.id : undefined,
      birthDate: '',
      address: '',
      education: '',
      experience: '',
      expectedSalary: '',
      notes: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutate(
      {
        data: {
          ...values,
          phone: normalizeUzPhone(values.phone),
        } as any,
      },
      {
      onSuccess: (data) => {
        toast({ title: 'Muvaffaqiyatli', description: 'Yangi nomzod qo\'shildi' });
        setLocation(`/candidates/${data.id}`);
      },
      onError: () => {
        toast({ title: 'Xatolik', description: 'Nomzod qo\'shishda xatolik', variant: 'destructive' });
      }
    });
  };

  if (!canAdd) {
    return (
      <div className="max-w-lg mx-auto rounded-xl border bg-white p-8 text-center">
        <h1 className="text-lg font-semibold">Ruxsat yoʻq</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nomzod qoʻshish faqat rekruter, HR va direktor uchun.
        </p>
        <Link href="/candidates">
          <Button className="mt-4" variant="outline">Orqaga</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/candidates">
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">1-qadam</p>
          <h1 className="text-3xl font-bold tracking-tight">Tanishuv</h1>
          <p className="text-muted-foreground mt-1">Yangi nomzodni tizimga kiritish — asosiy ma'lumotlar</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b pb-2">Asosiy ma'lumotlar</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>F.I.Sh *</FormLabel>
                        <FormControl>
                          <Input placeholder="Abdullayev Abdulla" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefon raqam *</FormLabel>
                        <FormControl>
                          <PhoneInput
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">{UZ_PHONE_HINT}</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vacancyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ish o'rni *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value?.toString() || ''}>
                          <FormControl>
                            <SelectTrigger disabled={vacsLoading}>
                              <SelectValue placeholder="Ish o'rnini tanlang" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {vacancies?.map(vac => (
                              <SelectItem key={vac.id} value={vac.id.toString()}>{vac.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="recruiterId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mas'ul rekruter</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value?.toString() || ''}>
                          <FormControl>
                            <SelectTrigger disabled={recsLoading}>
                              <SelectValue placeholder="Rekruterni tanlang" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {recruiters?.map(rec => (
                              <SelectItem key={rec.id} value={rec.id.toString()}>{rec.fullName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="birthDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tug'ilgan sana (ixtiyoriy)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expectedSalary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kutilayotgan maosh (ixtiyoriy)</FormLabel>
                        <FormControl>
                          <Input placeholder="Masalan: 5 000 000 so'm" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b pb-2">Qo'shimcha ma'lumotlar</h3>
                <div className="grid grid-cols-1 gap-6">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Yashash manzili (ixtiyoriy)</FormLabel>
                        <FormControl>
                          <Input placeholder="Toshkent sh., ..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="experience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ish tajribasi (ixtiyoriy)</FormLabel>
                        <FormControl>
                          <Textarea className="h-24" placeholder="Avvalgi ish joylari..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="education"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ma'lumoti (ixtiyoriy)</FormLabel>
                        <FormControl>
                          <Textarea className="h-24" placeholder="Qaysi OTM/Kollejni tamomlagan..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qaydlar (ixtiyoriy)</FormLabel>
                        <FormControl>
                          <Textarea className="h-20" placeholder="Nomzod haqida qo'shimcha fikrlar..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t">
                <Link href="/candidates">
                  <Button variant="ghost" type="button">Bekor qilish</Button>
                </Link>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Saqlanmoqda...' : 'Nomzodni qo\'shish'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
