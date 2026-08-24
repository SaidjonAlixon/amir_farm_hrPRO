import React, { useMemo } from 'react';
import { useCreateVacancy, useGetRequests, useGetUsers } from '@workspace/api-client-react';
import { useLocation, Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '../../components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import { isHrManager } from '../../lib/roles';

const formSchema = z.object({
  requestId: z.coerce.number({ required_error: "Arizani tanlang" }).min(1, "Arizani tanlang"),
  title: z.string().min(5, "Sarlavhani kiriting"),
  description: z.string().min(10, "Batafsil ma'lumot kiriting"),
  salaryRange: z.string().optional(),
  location: z.string().optional(),
  schedule: z.string().optional(),
  benefits: z.string().optional(),
  recruiterId: z.coerce.number({ required_error: "Rekruterni tanlang" }).min(1, "Rekruterni tanlang"),
  deadline: z.string().min(1, "Muddatni belgilang"),
});

export default function NewVacancy() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const initialReqId = searchParams.get('requestId');

  const canCreate = isHrManager(user?.role);

  const { mutate, isPending } = useCreateVacancy();
  const { data: requests, isLoading: reqsLoading } = useGetRequests({ status: 'accepted' });
  const { data: recruiters, isLoading: recsLoading } = useGetUsers({ role: 'recruiter' });

  const acceptedRequests = useMemo(
    () => (requests ?? []).filter((r) => r.status === 'accepted'),
    [requests],
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      requestId: initialReqId ? parseInt(initialReqId, 10) : undefined as unknown as number,
      title: '',
      description: '',
      salaryRange: '',
      location: 'Toshkent sh.',
      schedule: "To'liq ish kuni, 09:00 - 18:00",
      benefits: '',
      recruiterId: undefined as unknown as number,
      deadline: '',
    },
  });

  const applyRequestDefaults = (requestId: number) => {
    const req = acceptedRequests.find((r) => r.id === requestId);
    if (!req) return;
    if (!form.getValues('title')) form.setValue('title', req.position);
    if (!form.getValues('description')) {
      const parts = [req.description, req.requirements].filter(Boolean);
      form.setValue('description', parts.join('\n\n') || req.position);
    }
    if (!form.getValues('salaryRange') && req.salaryRange) {
      form.setValue('salaryRange', req.salaryRange);
    }
  };

  React.useEffect(() => {
    if (initialReqId && acceptedRequests.length) {
      applyRequestDefaults(parseInt(initialReqId, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptedRequests.length, initialReqId]);

  if (!canCreate) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-semibold">Ruxsat yo'q</h1>
        <p className="text-muted-foreground">Ish o'rnini faqat HR yoki admin yaratishi mumkin.</p>
        <Link href="/vacancies"><Button variant="outline">Orqaga</Button></Link>
      </div>
    );
  }

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const selected = acceptedRequests.find((r) => r.id === values.requestId);
    if (!selected) {
      toast({
        title: 'Xatolik',
        description: "Faqat qabul qilingan ariza asosida ish o'rni yaratiladi",
        variant: 'destructive',
      });
      return;
    }

    const deadlineIso = new Date(values.deadline).toISOString();

    mutate(
      {
        data: {
          requestId: values.requestId,
          title: values.title,
          description: values.description,
          salaryRange: values.salaryRange,
          location: values.location,
          schedule: values.schedule,
          benefits: values.benefits,
          recruiterId: values.recruiterId,
          deadline: deadlineIso,
        },
      },
      {
        onSuccess: (data) => {
          toast({
            title: 'Muvaffaqiyatli',
            description: "Ish o'rni yaratildi va rekruterga biriktirildi",
          });
          setLocation(`/vacancies/${data.id}`);
        },
        onError: (err: any) => {
          toast({
            title: 'Xatolik',
            description: err?.message || "Ish o'rni yaratishda xatolik",
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/vacancies">
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Yangi ish o'rni</h1>
          <p className="text-muted-foreground mt-1">
            Barcha bo'limlar Arizalari asosida — rekruter biriktirish va muddat belgilash
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {!reqsLoading && acceptedRequests.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <AlertCircle className="w-8 h-8 mx-auto text-amber-500" />
              <p className="font-medium">Qabul qilingan Ariza yo'q</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Avval istalgan bo'lim yoki rol bergan arizani «Qabul qilish» qiling — keyin shu yerda ish o'rni ochiladi.
              </p>
              <Link href="/requests">
                <Button variant="outline">Arizalarga o'tish</Button>
              </Link>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="requestId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Asos (qabul qilingan Ariza) *</FormLabel>
                        <Select
                          onValueChange={(v) => {
                            const id = Number(v);
                            field.onChange(id);
                            applyRequestDefaults(id);
                          }}
                          value={field.value?.toString() || ''}
                        >
                          <FormControl>
                            <SelectTrigger disabled={reqsLoading}>
                              <SelectValue placeholder="Qabul qilingan Arizani tanlang" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {acceptedRequests.map((req) => (
                              <SelectItem key={req.id} value={req.id.toString()}>
                                #{req.id} · {req.position} ({req.departmentName}) — {req.count} ta
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Barcha rollar/bo'limlar bergan Arizalar shu yerda</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="recruiterId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mas'ul rekruter *</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(Number(v))}
                          value={field.value?.toString() || ''}
                        >
                          <FormControl>
                            <SelectTrigger disabled={recsLoading}>
                              <SelectValue placeholder="Rekruterni tanlang" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(recruiters ?? []).map((r) => (
                              <SelectItem key={r.id} value={r.id.toString()}>
                                {r.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Faqat rekruterlar ro'yxati</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deadline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kadr topish muddati *</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormDescription>
                          Shu muddatgacha biriktirilgan rekruterga har 10 daqiqada ogohlantirish ketadi
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E'lon sarlavhasi *</FormLabel>
                        <FormControl>
                          <Input placeholder="Masalan: Tajribali Kardiolog shifokor" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Manzil</FormLabel>
                        <FormControl>
                          <Input placeholder="Manzil" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="schedule"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ish grafigi</FormLabel>
                        <FormControl>
                          <Input placeholder="Grafik" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="salaryRange"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maosh (ixtiyoriy)</FormLabel>
                        <FormControl>
                          <Input placeholder="5 mln so'mdan boshlab..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ish o'rni to'liq matni *</FormLabel>
                        <FormControl>
                          <Textarea className="h-40" placeholder="E'lon matnini kiriting..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="benefits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kompaniya taklif qiladi</FormLabel>
                        <FormControl>
                          <Textarea className="h-24" placeholder="Ijtimoiy paket, bonuslar..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t">
                  <Link href="/vacancies">
                    <Button variant="ghost" type="button">Bekor qilish</Button>
                  </Link>
                  <Button type="submit" disabled={isPending || acceptedRequests.length === 0}>
                    {isPending ? 'Saqlanmoqda...' : 'Yaratish va rekruterga biriktirish'}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
