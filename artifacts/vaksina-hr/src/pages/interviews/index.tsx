import React from 'react';
import { useGetPhoneInterviews, useGetOnlineInterviews, useGetOfflineInterviews, useGetCandidates } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Phone, Video, Users } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '../../components/ui/badge';
import { Link } from 'wouter';

const PHONE_RESULT_LABELS: Record<string, string> = {
  suitable: 'Tavsiya etiladi',
  not_suitable: 'Tavsiya etilmaydi',
  pending: 'Kutilmoqda',
};

const ATTENDANCE_LABELS: Record<string, string> = {
  attended: 'Keldi',
  absent: 'Kelmadi',
  pending: 'Kutilmoqda',
  scheduled: 'Rejalashtirilgan',
};

const RESULT_LABELS: Record<string, string> = {
  passed: "O'tdi",
  failed: "O'tmadi",
};

export default function InterviewsList() {
  const { data: phoneInterviews, isLoading: phoneLoading } = useGetPhoneInterviews();
  const { data: onlineInterviews, isLoading: onlineLoading } = useGetOnlineInterviews();
  const { data: offlineInterviews, isLoading: offlineLoading } = useGetOfflineInterviews();
  const { data: pendingCandidates } = useGetCandidates({ stage: 'offline_interview' });

  const offlineIds = new Set((offlineInterviews ?? []).map((i) => i.candidateId));
  const missingPending = (pendingCandidates ?? []).filter((c) => !offlineIds.has(c.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Suhbatlar</h1>
        <p className="text-muted-foreground mt-1">Rejalashtirilgan va o'tkazilgan barcha suhbatlar ro'yxati</p>
      </div>

      <Tabs defaultValue="offline" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="offline"><Users className="w-4 h-4 mr-2" /> Offline</TabsTrigger>
          <TabsTrigger value="online"><Video className="w-4 h-4 mr-2" /> Online</TabsTrigger>
          <TabsTrigger value="phone"><Phone className="w-4 h-4 mr-2" /> Tanishuv</TabsTrigger>
        </TabsList>
        
        <TabsContent value="offline" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Yuzma-yuz suhbatlar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b">
                    <tr>
                      <th className="px-6 py-4 font-medium">Sana va Vaqt</th>
                      <th className="px-6 py-4 font-medium">Nomzod</th>
                      <th className="px-6 py-4 font-medium">Qatnashuvchilar</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium text-right">Amal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {offlineLoading ? (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Yuklanmoqda...</td></tr>
                    ) : ((offlineInterviews && offlineInterviews.length > 0) || missingPending.length > 0) ? (
                      <>
                        {missingPending.map((c) => (
                          <tr key={`pending-${c.id}`} className="hover:bg-amber-50/50 bg-amber-50/30">
                            <td className="px-6 py-4">
                              <div className="font-medium text-muted-foreground italic">Belgilanmagan</div>
                            </td>
                            <td className="px-6 py-4">
                              <Link href={`/candidates/${c.id}`} className="font-semibold hover:text-primary">
                                {c.fullName}
                              </Link>
                            </td>
                            <td className="px-6 py-4 text-xs text-muted-foreground">—</td>
                            <td className="px-6 py-4">
                              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Kutilmoqda</Badge>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Link href={`/candidates/${c.id}/offline-interview`} className="text-primary text-sm font-medium hover:underline">
                                Natijani kiritish
                              </Link>
                            </td>
                          </tr>
                        ))}
                        {(offlineInterviews ?? []).map((interview) => (
                        <tr key={interview.id} className="hover:bg-muted/30">
                          <td className="px-6 py-4">
                            <div className="font-medium">{format(new Date(interview.scheduledDate), 'dd.MM.yyyy')}</div>
                            <div className="text-xs text-muted-foreground">{interview.scheduledTime || 'Belgilanmagan'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <Link href={`/candidates/${interview.candidateId}`} className="font-semibold hover:text-primary">
                              {interview.candidateName || 'Noma\'lum nomzod'}
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-xs">
                              {interview.hrName && <div>HR: {interview.hrName}</div>}
                              {interview.trainerName && <div>Trener: {interview.trainerName}</div>}
                              {!interview.hrName && !interview.trainerName && <span className="text-muted-foreground">—</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {interview.result ? (
                              <Badge
                                variant={interview.result === 'passed' ? 'default' : 'destructive'}
                                className={interview.result === 'passed' ? 'bg-emerald-100 text-emerald-800' : ''}
                              >
                                {RESULT_LABELS[interview.result] || interview.result}
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                                {ATTENDANCE_LABELS[interview.attendanceStatus ?? ''] || 'Kutilmoqda'}
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link
                              href={`/candidates/${interview.candidateId}/offline-interview`}
                              className="text-primary text-sm font-medium hover:underline"
                            >
                              {interview.result ? "Ko'rish" : 'Natijani kiritish'}
                            </Link>
                          </td>
                        </tr>
                        ))}
                      </>
                    ) : (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Suhbatlar topilmadi</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="online" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Onlayn suhbatlar (Testlar)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b">
                    <tr>
                      <th className="px-6 py-4 font-medium">Sana</th>
                      <th className="px-6 py-4 font-medium">Nomzod</th>
                      <th className="px-6 py-4 font-medium">Tajriba darajasi</th>
                      <th className="px-6 py-4 font-medium">Natija</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {onlineLoading ? (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Yuklanmoqda...</td></tr>
                    ) : onlineInterviews && onlineInterviews.length > 0 ? (
                      onlineInterviews.map((interview) => (
                        <tr key={interview.id} className="hover:bg-muted/30">
                          <td className="px-6 py-4">
                            <div className="font-medium">{interview.interviewDate ? format(new Date(interview.interviewDate), 'dd.MM.yyyy') : 'Noma\'lum'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <Link href={`/candidates/${interview.candidateId}`} className="font-semibold hover:text-primary">
                              {interview.candidateName || `Nomzod #${interview.candidateId}`}
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            {interview.experienceLevel === 'experienced' ? 'Tajribali' : interview.experienceLevel === 'inexperienced' ? 'Tajribasiz' : 'Aniqlanmagan'}
                          </td>
                          <td className="px-6 py-4">
                            {interview.score !== undefined && interview.score !== null ? (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{interview.score} / 100</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">Kiritilmagan</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Onlayn suhbatlar topilmadi</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="phone" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Tanishuv</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b">
                    <tr>
                      <th className="px-6 py-4 font-medium">Sana</th>
                      <th className="px-6 py-4 font-medium">Nomzod</th>
                      <th className="px-6 py-4 font-medium">Rekruter</th>
                      <th className="px-6 py-4 font-medium">Natija</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {phoneLoading ? (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Yuklanmoqda...</td></tr>
                    ) : phoneInterviews && phoneInterviews.length > 0 ? (
                      phoneInterviews.map((interview) => (
                        <tr key={interview.id} className="hover:bg-muted/30">
                          <td className="px-6 py-4">
                            <div className="font-medium">{interview.interviewDate ? format(new Date(interview.interviewDate), 'dd.MM.yyyy') : 'Noma\'lum'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <Link href={`/candidates/${interview.candidateId}`} className="font-semibold hover:text-primary">
                              {interview.candidateName || `Nomzod #${interview.candidateId}`}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {interview.recruiterName || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant={interview.status === 'suitable' ? 'default' : interview.status === 'not_suitable' ? 'destructive' : 'secondary'} className={interview.status === 'suitable' ? 'bg-emerald-100 text-emerald-800' : ''}>
                              {PHONE_RESULT_LABELS[interview.status ?? ''] || interview.status || '—'}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Tanishuv yozuvlari topilmadi</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
