import React from 'react';
import { useCreateRequest, useGetDepartments } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '../../hooks/use-toast';

const formSchema = z.object({
  departmentId: z.coerce.number({ required_error: "Bo'limni tanlang" }).min(1, "Bo'limni tanlang"),
  position: z.string().min(2, "Lavozim nomi kamida 2ta harf bo'lishi kerak"),
  count: z.coerce.number().min(1, "Kamida 1 kishi kerak"),
  priority: z.enum(['normal', 'urgent']),
  city: z.string().min(2, "Shaharni kiriting"),
  district: z.string().min(2, "Tumanni kiriting"),
  salaryRange: z.string().optional(),
  deadline: z.string().optional(),
  requirements: z.string().min(10, "Talablar batafsil yozilishi kerak"),
  description: z.string().min(10, "Vazifalar batafsil yozilishi kerak"),
  reason: z.string().optional(),
});

export default function NewRequest() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { mutate, isPending } = useCreateRequest();
  const { data: departments, isLoading: deptsLoading } = useGetDepartments();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      position: '',
      count: 1,
      priority: 'normal',
      city: '',
      district: '',
      salaryRange: '',
      deadline: '',
      requirements: '',
      description: '',
      reason: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutate({ data: values as any }, {
      onSuccess: (data) => {
        toast({ title: 'Muvaffaqiyatli', description: 'Ariza yaratildi' });
        setLocation(`/requests/${data.id}`);
      },
      onError: () => {
        toast({ title: 'Xatolik', description: 'Ariza yaratishda xatolik', variant: 'destructive' });
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/requests">
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Yangi Ariza</h1>
          <p className="text-muted-foreground mt-1">Yangi xodim qidirish uchun so'rovnoma</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bo'lim *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger disabled={deptsLoading}>
                            <SelectValue placeholder="Bo'limni tanlang" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments?.map(dept => (
                            <SelectItem key={dept.id} value={dept.id.toString()}>{dept.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lavozim nomi *</FormLabel>
                      <FormControl>
                        <Input placeholder="Masalan: Kardiolog" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="count"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kerakli xodimlar soni *</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioritet *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Prioritetni tanlang" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="normal">Odatdagi (1-2 oy)</SelectItem>
                          <SelectItem value="urgent">Shoshilinch (1-2 hafta)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shahar *</FormLabel>
                      <FormControl>
                        <Input placeholder="Masalan: Toshkent" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="district"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tuman *</FormLabel>
                      <FormControl>
                        <Input placeholder="Masalan: Yunusobod" {...field} />
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
                      <FormLabel>Kutilayotgan maosh (ixtiyoriy)</FormLabel>
                      <FormControl>
                        <Input placeholder="5 - 8 mln so'm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Yopish muddati (ixtiyoriy)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
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
                      <FormLabel>Vazifalar (Asosiy ishlar) *</FormLabel>
                      <FormControl>
                        <Textarea className="h-24" placeholder="Xodim nima ishlar qiladi..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requirements"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Talablar *</FormLabel>
                      <FormControl>
                        <Textarea className="h-24" placeholder="Ta'lim, tajriba, ko'nikmalar..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ish o'rni ochilish sababi (ixtiyoriy)</FormLabel>
                      <FormControl>
                        <Textarea className="h-16" placeholder="Yangi shtat, xodim ketdi, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t">
                <Link href="/requests">
                  <Button variant="ghost" type="button">Bekor qilish</Button>
                </Link>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Saqlanmoqda...' : 'Ariza berish'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
