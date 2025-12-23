"use client";

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/language-context';
import { useAuth } from '@/contexts/auth-context';
import { Library, Newspaper, Network, FileQuestion, ClipboardList, Home, Users, Settings, ClipboardCheck, MessageSquare, GraduationCap, Crown, Shield, UserCheck, TrendingUp, Megaphone, CalendarDays, BarChart3, CreditCard } from 'lucide-react';
import NotificationsPanel from '@/components/common/notifications-panel';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import MonitoCalificaciones from '@/components/monito-calificaciones';
import { TaskNotificationManager } from '@/lib/notifications';

// Interfaz para los comentarios de tareas
interface TaskComment {
  id: string;
  taskId: string;
  studentUsername: string;
  studentName: string;
  comment: string;
  timestamp: string;
  isSubmission: boolean;
  isNew?: boolean;
  readBy?: string[];
  authorUsername?: string; // 🔥 NUEVO: Quién escribió realmente el comentario
  authorRole?: 'student' | 'teacher'; // 🔥 NUEVO: Rol del autor real
}

// 🎯 Función helper para verificar asignación de estudiante a tarea
const checkStudentAssignmentToTask = (task: any, studentId: string, studentUsername: string): boolean => {
  console.log(`🔍 [checkStudentAssignmentToTask] Verificando acceso de ${studentUsername} a "${task.title}"`);
  
  // Si la tarea está asignada a estudiantes específicos
  if (task.assignedTo === 'student' && task.assignedStudentIds) {
    const isDirectlyAssigned = task.assignedStudentIds.includes(studentId);
    console.log(`🎯 [checkStudentAssignmentToTask] Asignación directa: ${isDirectlyAssigned ? '✅' : '❌'}`);
    return isDirectlyAssigned;
  }
  
  // Si la tarea está asignada a todo el curso
  if (task.assignedTo === 'course') {
    const taskCourseId = task.courseSectionId || task.course;
    
    if (!taskCourseId) {
      console.log(`⚠️ [checkStudentAssignmentToTask] Tarea sin courseId`);
      return false;
    }
    
    // Obtener datos del localStorage
    const users = JSON.parse(localStorage.getItem('smart-student-users') || '[]');
    const studentData = users.find((u: any) => u.id === studentId || u.username === studentUsername);
    
    if (!studentData) {
      console.log(`❌ [checkStudentAssignmentToTask] Estudiante no encontrado`);
      return false;
    }
    
    // Verificar asignaciones específicas
    const studentAssignments = JSON.parse(localStorage.getItem('smart-student-student-assignments') || '[]');
    const courses = JSON.parse(localStorage.getItem('smart-student-courses') || '[]');
    const sections = JSON.parse(localStorage.getItem('smart-student-sections') || '[]');
    
    // Buscar asignación que coincida con el curso de la tarea
    const matchingAssignment = studentAssignments.find((assignment: any) => {
      if (assignment.studentId !== studentId) return false;
      
      const course = courses.find((c: any) => c.id === assignment.courseId);
      const section = sections.find((s: any) => s.id === assignment.sectionId);
      const compositeId = `${course?.id}-${section?.id}`;
      
      return compositeId === taskCourseId || assignment.courseId === taskCourseId;
    });
    
    if (matchingAssignment) {
      console.log(`✅ [checkStudentAssignmentToTask] Acceso por asignación específica`);
      return true;
    }
    
    // Fallback: verificar por activeCourses
    const isInActiveCourses = studentData.activeCourses?.includes(taskCourseId) || false;
    console.log(`🔄 [checkStudentAssignmentToTask] Fallback activeCourses: ${isInActiveCourses ? '✅' : '❌'}`);
    
    return isInActiveCourses;
  }
  
  // Compatibilidad con versiones anteriores
  if (task.assignedStudents && task.assignedStudents.includes(studentUsername)) {
    console.log(`🔄 [checkStudentAssignmentToTask] Fallback assignedStudents: ✅`);
    return true;
  }
  
  console.log(`❌ [checkStudentAssignmentToTask] Sin acceso`);
  return false;
};

const featureCards = [
  {
    titleKey: 'cardBooksTitle',
    descKey: 'cardBooksDesc',
    btnKey: 'cardBooksBtn',
    targetPage: '/dashboard/libros',
    icon: Library,
    colorClass: 'green',
  },
  {
    titleKey: 'cardSummaryTitle',
    descKey: 'cardSummaryDesc',
    btnKey: 'cardSummaryBtn',
    targetPage: '/dashboard/resumen',
    icon: Newspaper,
    colorClass: 'blue', // Ensured this is 'blue'
  },
  {
    titleKey: 'cardMapTitle',
    descKey: 'cardMapDesc',
    btnKey: 'cardMapBtn',
    targetPage: '/dashboard/mapa-mental',
    icon: Network,
    colorClass: 'yellow',
  },
  {
    titleKey: 'cardQuizTitle',
    descKey: 'cardQuizDesc',
    btnKey: 'cardQuizBtn',
    targetPage: '/dashboard/cuestionario',
    icon: FileQuestion,
    colorClass: 'cyan',
  },
  {
    titleKey: 'cardEvalTitle',
    descKey: 'cardEvalDesc',
    btnKey: 'cardEvalBtn',
    targetPage: '/dashboard/evaluacion',
    icon: ClipboardList,
    colorClass: 'purple',
  },
  // Nueva tarjeta: Pruebas (entre Evaluaciones y Tareas)
  {
    titleKey: 'cardTasksTitle',
    descKey: 'cardTasksDesc',
    btnKey: 'cardTasksBtn',
    targetPage: '/dashboard/tareas',
    icon: ClipboardCheck,
    colorClass: 'orange',
    showBadge: true, // Para mostrar la burbuja de notificación
  },
  {
    titleKey: 'cardTestsTitle',
    descKey: 'cardTestsDesc',
    btnKey: 'cardTestsBtn',
    targetPage: '/dashboard/pruebas',
    icon: ClipboardCheck,
  colorClass: 'fuchsia',
  },
  {
    titleKey: 'cardSlidesTitle',
    descKey: 'cardSlidesDesc',
    btnKey: 'cardSlidesBtn',
    targetPage: '/dashboard/slides',
    icon: GraduationCap,
  colorClass: 'lime',
  },
  {
    titleKey: 'cardCommunicationsStudentTitle',
    descKey: 'cardCommunicationsStudentDesc',
    btnKey: 'cardCommunicationsStudentBtn',
    targetPage: '/dashboard/comunicaciones',
    icon: Megaphone,
    colorClass: 'red',
    showBadge: false,
  },
  // Nueva tarjeta Calificaciones (todos los roles)
  {
    titleKey: 'cardGradesTitle',
    descKey: 'cardGradesDesc',
    btnKey: 'cardGradesBtn',
    targetPage: '/dashboard/calificaciones',
    icon: BarChart3,
  colorClass: 'indigo',
    showBadge: false,
  },
];

const adminCards = [
  {
    titleKey: 'cardUserManagementTitle',
    descKey: 'cardUserManagementDesc',
    btnKey: 'cardUserManagementBtn',
    targetPage: '/dashboard/gestion-usuarios',
    icon: Users,
    colorClass: 'teal',
    showBadge: true, // Para mostrar la burbuja de notificación si hay pendientes
  },
  {
    titleKey: 'cardPasswordRequestsTitle',
    descKey: 'cardPasswordRequestsDesc',
    btnKey: 'cardPasswordRequestsBtn',
    targetPage: '/dashboard/solicitudes',
    icon: ClipboardCheck,
    colorClass: 'red',
    showBadge: true, // Para mostrar la burbuja de notificación de solicitudes de contraseña
  },
  // Nueva tarjeta Asistencia (solo admin)
  {
    titleKey: 'cardAttendanceTitle',
    descKey: 'cardAttendanceDesc',
    btnKey: 'cardAttendanceBtn',
    targetPage: '/dashboard/asistencia',
    icon: UserCheck,
    colorClass: 'emerald',
    showBadge: false,
  },
  // Nueva tarjeta Calendario (solo admin)
  {
    titleKey: 'cardCalendarTitle',
    descKey: 'cardCalendarDesc',
    btnKey: 'cardCalendarBtn',
    targetPage: '/dashboard/calendario',
    icon: CalendarDays,
    colorClass: 'silver',
    showBadge: false,
  },
  // Calificaciones para admin
  {
    titleKey: 'cardGradesTitle',
    descKey: 'cardGradesDesc',
    btnKey: 'cardGradesBtn',
    targetPage: '/dashboard/calificaciones',
    icon: BarChart3,
  colorClass: 'indigo',
    showBadge: false,
  },
  // Nueva tarjeta Estadísticas (admin) - ahora después de Calificaciones
  {
    titleKey: 'cardStatisticsTitle',
    descKey: 'cardStatisticsDesc',
    btnKey: 'cardStatisticsBtn',
    targetPage: '/dashboard/estadisticas',
    icon: TrendingUp,
    colorClass: 'rose',
    showBadge: false,
  },
];

// Tarjetas específicas para profesores
const teacherCards = [
  {
    titleKey: 'cardAttendanceTitle', 
    descKey: 'cardAttendanceDesc',
    btnKey: 'cardAttendanceBtn',
    targetPage: '/dashboard/asistencia',
    icon: UserCheck,
  colorClass: 'emerald',
  showBadge: true,
  },
  {
    titleKey: 'cardStatisticsTitle',
    descKey: 'cardStatisticsDesc', 
    btnKey: 'cardStatisticsBtn',
    targetPage: '/dashboard/estadisticas',
    icon: TrendingUp,
  colorClass: 'rose',
    showBadge: false,
  },
  // Calificaciones para profesores
  {
    titleKey: 'cardGradesTitle',
    descKey: 'cardGradesDesc',
    btnKey: 'cardGradesBtn',
    targetPage: '/dashboard/calificaciones',
    icon: BarChart3,
  colorClass: 'indigo',
    showBadge: false,
  },
];

// Tarjetas específicas para apoderados (guardians)
const guardianCards = [
  // Comunicaciones para apoderados
  {
    titleKey: 'cardCommunicationsStudentTitle',
    descKey: 'cardCommunicationsStudentDesc',
    btnKey: 'cardCommunicationsStudentBtn',
    targetPage: '/dashboard/comunicaciones',
    icon: Megaphone,
    colorClass: 'red',
    showBadge: false,
  },
  // Calificaciones para apoderados
  {
    titleKey: 'cardGradesTitle',
    descKey: 'cardGradesDesc',
    btnKey: 'cardGradesBtn',
    targetPage: '/dashboard/calificaciones',
    icon: BarChart3,
    colorClass: 'indigo',
    showBadge: false,
  },
  // Financiera para apoderados (al final)
  {
    titleKey: 'cardFinanceTitle',
    descKey: 'cardFinanceDesc',
    btnKey: 'cardFinanceBtn',
    targetPage: '/dashboard/financiera',
    icon: CreditCard,
    colorClass: 'mint',
    showBadge: false,
  },
];

export default function DashboardHomePage() {
  const { translate } = useLanguage();
  const { user } = useAuth();
  const [unreadCommentsCount, setUnreadCommentsCount] = useState(0);
  const [pendingPasswordRequestsCount, setPendingPasswordRequestsCount] = useState(0);
  const [pendingTaskSubmissionsCount, setPendingTaskSubmissionsCount] = useState(0);
  const [unreadStudentCommentsCount, setUnreadStudentCommentsCount] = useState(0);
  const [taskNotificationsCount, setTaskNotificationsCount] = useState(0);
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [unreadCommunicationsCount, setUnreadCommunicationsCount] = useState(0);
  const [pendingAttendanceCount, setPendingAttendanceCount] = useState(0);

  // Calcular asistencia pendiente para profesores (pendiente si NO todos los estudiantes de la sección tienen marcaje hoy)
  const computePendingAttendanceCount = () => {
    try {
      if (!user || user.role !== 'teacher') { setPendingAttendanceCount(0); return; }
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const todayStr = `${y}-${m}-${d}`;

      // Si hoy es día no laborable según el Calendario Admin, no exigir asistencia
      try {
        const loadCfg = (year: number) => {
          const def = { showWeekends: true, summer: {}, winter: {}, holidays: [] as string[] } as any;
          const raw = localStorage.getItem(`admin-calendar-${year}`);
          if (!raw) return def;
          let parsed: any = null; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { /* ignore */ } }
          return { ...def, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
        };
        const pad = (n: number) => String(n).padStart(2, '0');
        const key = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
        const cfg = loadCfg(today.getFullYear());
        const inRange = (date: Date, range?: { start?: string; end?: string }) => {
          if (!range?.start || !range?.end) return false;
          const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
          const parseYmdLocal = (ymd: string) => {
            const [yy, mm, dd] = ymd.split('-').map(Number);
            return new Date(yy, (mm || 1) - 1, dd || 1);
          };
          const a = parseYmdLocal(range.start).getTime();
          const b = parseYmdLocal(range.end).getTime();
          const [min, max] = a <= b ? [a, b] : [b, a];
          return t >= min && t <= max;
        };
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;
        const isHoliday = Array.isArray(cfg.holidays) && cfg.holidays.includes(key);
        const isSummer = inRange(today, cfg.summer);
        const isWinter = inRange(today, cfg.winter);
  // Solo considerar fin de semana como no laborable si showWeekends=true
  const weekendBlocked = cfg.showWeekends ? isWeekend : false;
  if (weekendBlocked || isHoliday || isSummer || isWinter) { setPendingAttendanceCount(0); return; }
      } catch {}

      const teacherAssignments = JSON.parse(localStorage.getItem('smart-student-teacher-assignments') || '[]');
      const myAssignments = teacherAssignments.filter((ta: any) =>
        ta.teacherId === user.id || ta.teacherUsername === user.username || ta.teacher === user.username
      );
      const sections = JSON.parse(localStorage.getItem('smart-student-sections') || '[]');
      const studentAssignments = JSON.parse(localStorage.getItem('smart-student-student-assignments') || '[]');
      const uniqueCS: Array<{ id: string; courseId: string; sectionId: string }> = [];
      const seen = new Set<string>();
      myAssignments.forEach((ta: any) => {
        const sectionId = ta.sectionId || ta.section || ta.sectionUUID || ta.section_id || ta.sectionID;
        let courseId = ta.courseId || ta.course || ta.courseUUID || ta.course_id || ta.courseID;
        if (!courseId && sectionId) {
          const sec = sections.find((s: any) => s && (s.id === sectionId || s.sectionId === sectionId));
          courseId = sec?.courseId || (sec?.course && (sec.course.id || sec.courseId)) || courseId;
        }
        if (sectionId) {
          const id = `${courseId || 'unknown-course'}-${sectionId}`;
          if (!seen.has(id)) { seen.add(id); uniqueCS.push({ id, courseId: courseId || 'unknown-course', sectionId }); }
        }
      });

      const attendance = JSON.parse(localStorage.getItem('smart-student-attendance') || '[]');
      let pending = 0;
      uniqueCS.forEach(({ id, sectionId }) => {
        // Estudiantes asignados a la sección
        const assigned = (studentAssignments || []).filter((sa: any) => sa.sectionId === sectionId);
        const assignedCount = assigned.length;

        // Registros únicos por estudiante hoy para este curso-sección
        const todaySectionRecords = (attendance || []).filter((r: any) => r.date === todayStr && r.course === id);
        const uniqueStudents = new Set<string>();
        todaySectionRecords.forEach((r: any) => { if (r.studentUsername) uniqueStudents.add(r.studentUsername); });

        // Contar como pendiente si aún no están todos marcados
        const isPending = assignedCount > 0 ? uniqueStudents.size < assignedCount : false;
        if (isPending) pending++;
      });
      setPendingAttendanceCount(pending);
    } catch (e) {
      console.error('[Dashboard] Error calculando asistencia pendiente:', e);
      setPendingAttendanceCount(0);
    }
  };

  useEffect(() => { computePendingAttendanceCount(); }, [user]);

  // Utilidad: cargar comunicaciones recibidas del estudiante/apoderado y contar no leídas
  const loadUnreadCommunicationsCount = () => {
    try {
      if (!user || (user.role !== 'student' && user.role !== 'guardian')) { setUnreadCommunicationsCount(0); return; }
      const commRaw = localStorage.getItem('smart-student-communications');
      if (!commRaw) { setUnreadCommunicationsCount(0); return; }
      const all = JSON.parse(commRaw) as any[];
      const currentYear = new Date().getFullYear();
      const courses = JSON.parse(localStorage.getItem(`smart-student-courses-${currentYear}`) || localStorage.getItem('smart-student-courses') || '[]');
      
      // Obtener asignaciones de estudiantes (por año primero, luego legacy)
      let assignments: any[] = [];
      const yearAssignments = localStorage.getItem(`smart-student-student-assignments-${currentYear}`);
      const legacyAssignments = localStorage.getItem('smart-student-student-assignments');
      if (yearAssignments) {
        assignments = JSON.parse(yearAssignments);
      } else if (legacyAssignments) {
        assignments = JSON.parse(legacyAssignments);
      }

      const getCourseName = (id?: string, fb?: string) => {
        if (!id) return fb || '';
        return courses.find((c: any) => c.id === id)?.name || fb || '';
      };

      // Para apoderados: obtener estudiantes asignados (misma lógica que comunicaciones/page.tsx)
      if (user.role === 'guardian') {
        const currentYear = new Date().getFullYear();
        let assignedStudentIds: string[] = [];
        
        // Prioridad 1: Buscar en smart-student-guardians-{year} (datos de carga masiva)
        const guardiansForYear = JSON.parse(localStorage.getItem(`smart-student-guardians-${currentYear}`) || '[]');
        const guardianFromYear = guardiansForYear.find((g: any) => 
          g.username?.toLowerCase() === user.username?.toLowerCase() ||
          g.id === user.id
        );
        
        if (guardianFromYear?.studentIds && guardianFromYear.studentIds.length > 0) {
          assignedStudentIds = guardianFromYear.studentIds;
        }
        
        // Prioridad 2: Buscar en smart-student-guardian-student-relations-{year}
        if (assignedStudentIds.length === 0) {
          let guardianRelations = JSON.parse(localStorage.getItem(`smart-student-guardian-student-relations-${currentYear}`) || '[]');
          if (guardianRelations.length === 0) {
            guardianRelations = JSON.parse(localStorage.getItem('smart-student-guardian-student-relations') || '[]');
          }
          assignedStudentIds = guardianRelations
            .filter((rel: any) => rel.guardianId === user.id || rel.guardianUsername === user.username)
            .map((rel: any) => rel.studentId);
        }
        
        // Prioridad 3: Buscar en smart-student-users (fullUserData.studentIds)
        if (assignedStudentIds.length === 0) {
          const storedUsers = localStorage.getItem('smart-student-users');
          if (storedUsers) {
            const usersData = JSON.parse(storedUsers);
            const fullUserData = usersData.find((u: any) => 
              u.username?.toLowerCase() === user.username?.toLowerCase()
            );
            if (fullUserData?.studentIds && fullUserData.studentIds.length > 0) {
              assignedStudentIds = fullUserData.studentIds;
            }
          }
        }
        
        if (assignedStudentIds.length === 0) {
          setUnreadCommunicationsCount(0);
          return;
        }

        // ============ CONSTRUIR ASIGNACIONES DE ESTUDIANTES (igual que comunicaciones/page.tsx) ============
        // Si no hay asignaciones en student-assignments, buscar en los datos de los estudiantes
        let studentAssignmentsForGuardian = assignments.filter((a: any) => 
          a && assignedStudentIds.includes(a.studentId)
        );
        
        // Si no hay asignaciones, buscar en los datos de estudiantes directamente
        if (studentAssignmentsForGuardian.length === 0) {
          const studentsForYear = JSON.parse(localStorage.getItem(`smart-student-students-${currentYear}`) || '[]');
          const allUsers = JSON.parse(localStorage.getItem('smart-student-users') || '[]');
          
          // Buscar en studentsForYear
          studentsForYear
            .filter((s: any) => assignedStudentIds.includes(s.id) || assignedStudentIds.includes(s.username))
            .forEach((s: any) => {
              if (s.courseId && s.sectionId) {
                studentAssignmentsForGuardian.push({
                  studentId: s.id,
                  courseId: s.courseId,
                  sectionId: s.sectionId
                });
              }
            });
          
          // Buscar en allUsers
          allUsers
            .filter((u: any) => (u.role === 'student' || u.type === 'student') && 
              (assignedStudentIds.includes(u.id) || assignedStudentIds.includes(u.username)))
            .forEach((u: any) => {
              if (u.courseId && u.sectionId) {
                const exists = studentAssignmentsForGuardian.find((a: any) => a.studentId === u.id);
                if (!exists) {
                  studentAssignmentsForGuardian.push({
                    studentId: u.id,
                    courseId: u.courseId,
                    sectionId: u.sectionId
                  });
                }
              }
            });
        }

        // Buscar comunicaciones para los estudiantes asignados al apoderado
        // 🔧 CORRECCIÓN: Contar cada instancia por estudiante de forma independiente
        let unreadCount = 0;
        
        all.forEach((comm: any) => {
          // Comunicaciones dirigidas específicamente a alguno de los estudiantes asignados
          if (comm.type === 'student' && assignedStudentIds.includes(comm.targetStudent)) {
            // Para comunicaciones a estudiante específico, usar identificador compuesto
            const readByKey = `${user.id}_forStudent_${comm.targetStudent}`;
            if (!(comm.readBy || []).includes(readByKey) && !(comm.readBy || []).includes(user.id)) {
              unreadCount++;
            }
            return;
          }
          
          // Comunicaciones de curso: verificar si algún estudiante asignado pertenece al curso/sección
          if (comm.type === 'course' && comm.targetCourse) {
            // Encontrar todos los estudiantes que pertenecen a este curso/sección
            const matchingStudents = studentAssignmentsForGuardian.filter((a: any) => {
              const courseMatch = a.courseId === comm.targetCourse;
              const sectionMatch = !comm.targetSection || a.sectionId === comm.targetSection;
              return courseMatch && sectionMatch;
            });
            
            // Contar cada instancia por estudiante como no leída si no tiene el identificador compuesto
            matchingStudents.forEach((assignment: any) => {
              const readByKey = `${user.id}_forStudent_${assignment.studentId}`;
              if (!(comm.readBy || []).includes(readByKey) && !(comm.readBy || []).includes(user.id)) {
                unreadCount++;
              }
            });
          }
        });

        setUnreadCommunicationsCount(unreadCount);
        return;
      }

      // Para estudiantes: lógica existente
      const myAssignments = assignments.filter((a: any) => a && a.studentId === user.id);
      const active = (user as any).activeCourses as string[] | undefined;
      const studentSectionName = (user as any).sectionName;

      const belongsToStudent = (comm: any): boolean => {
        if (comm.type === 'student' && comm.targetStudent === user.id) return true;
        if (comm.type !== 'course') return false;
        const courseId = comm.targetCourse; const sectionId = comm.targetSection;
        if (myAssignments.length > 0) {
          const matchCourseAndSection = myAssignments.some((a: any) => a.courseId === courseId && a.sectionId === sectionId);
          if (matchCourseAndSection) return true;
          const matchSectionOnly = myAssignments.some((a: any) => a.sectionId === sectionId);
          if (matchSectionOnly) return true;
          if (studentSectionName && comm.targetSectionName && studentSectionName === comm.targetSectionName) return true;
          return false;
        }
        if (active && active.length > 0) {
          const courseName = getCourseName(courseId, comm.targetCourseName);
          const normalizedActive = active.map(v => String(v));
          const hasCourse = normalizedActive.some(str => {
            if (!str) return false;
            if (str === courseId) return true;
            if (courseName && (str === courseName || str.includes(courseName))) return true;
            return false;
          });
          if (!hasCourse) return false;
          if (studentSectionName && comm.targetSectionName) return studentSectionName === comm.targetSectionName;
          return true;
        }
        return true;
      };

      const received = all.filter(belongsToStudent);
      const unread = received.filter((c: any) => !((c.readBy || []).includes(user.id)));
      setUnreadCommunicationsCount(unread.length);
    } catch (e) {
      console.error('[Dashboard] Error cargando comunicaciones del estudiante/apoderado:', e);
      setUnreadCommunicationsCount(0);
    }
  };

  // Cargar comentarios no leídos de las tareas y entregas pendientes
  useEffect(() => {
    if (user) {
      // Cargar notificaciones de tareas
      loadTaskNotifications();
      // Cargar tareas pendientes reales
      loadPendingTasks();
      
      // Cargar comentarios de tareas del localStorage
      const storedComments = localStorage.getItem('smart-student-task-comments');
      if (storedComments) {
        const comments: TaskComment[] = JSON.parse(storedComments);
        
        if (user.role === 'student') {
          // 🎯 FILTRADO CRÍTICO: Aplicar la misma lógica que en notifications-panel.tsx
          const storedTasks = localStorage.getItem('smart-student-tasks');
          const tasks = storedTasks ? JSON.parse(storedTasks) : [];
          
          // Filtrar comentarios que no han sido leídos por el usuario actual
          // EXCLUIR comentarios de entrega (isSubmission) ya que son parte del trabajo entregado, no comentarios de discusión
          let unread = comments.filter((comment: TaskComment) => {
            // Filtros básicos - No contar comentarios propios (verificar tanto studentUsername como authorUsername)
            if (comment.studentUsername === user.username || comment.authorUsername === user.username) {
              return false;
            }
            
            // No contar ya leídos
            if (comment.readBy?.includes(user.username)) {
              return false;
            }
            
            // No contar entregas de otros estudiantes
            if (comment.isSubmission) {
              return false;
            }
            
            // 🎯 FILTRO CRÍTICO: Verificar asignación específica para estudiantes
            const task = tasks.find((t: any) => t.id === comment.taskId);
            if (!task) {
              console.log(`🚫 [Dashboard-Student] Tarea no encontrada para comentario: ${comment.taskId}`);
              return false;
            }
            
            console.log(`🔍 [Dashboard-Student] Procesando comentario en tarea "${task.title}" (assignedTo: ${task.assignedTo})`);
            console.log(`📝 [Dashboard-Student] Comentario por: ${comment.authorUsername || comment.studentUsername} (${comment.authorRole || 'student'})`);
            
            // Si es una tarea asignada a estudiantes específicos
            if (task.assignedTo === 'student' && task.assignedStudentIds) {
              const users = JSON.parse(localStorage.getItem('smart-student-users') || '[]');
              const currentUser = users.find((u: any) => u.username === user.username);
              
              if (!currentUser || !task.assignedStudentIds.includes(currentUser.id)) {
                console.log(`🚫 [Dashboard-Student] Estudiante ${user.username} NO asignado a tarea específica "${task.title}" - Filtrando comentario del conteo`);
                return false;
              }
              
              console.log(`✅ [Dashboard-Student] Estudiante ${user.username} SÍ asignado a tarea específica "${task.title}" - Incluyendo comentario en conteo`);
              return true;
            }
            
            // 🎯 NUEVO: Para tareas de curso completo, aplicar la misma lógica que en notifications-panel
            if (task.assignedTo === 'course') {
              const isAssignedToTask = checkStudentAssignmentToTask(task, user.id || '', user.username || '');
              
              if (!isAssignedToTask) {
                console.log(`🚫 [Dashboard-Student] Estudiante ${user.username} NO asignado a tarea de curso "${task.title}" - Filtrando comentario del conteo`);
                return false;
              }
              
              console.log(`✅ [Dashboard-Student] Estudiante ${user.username} SÍ asignado a tarea de curso "${task.title}" - Incluyendo comentario en conteo`);
              return true;
            }
            
            // Fallback para compatibilidad con versiones anteriores
            console.log(`🔄 [Dashboard-Student] Comentario incluido por compatibilidad`);
            return true;
          });

          // Eliminar duplicados de comentarios del profesor (por taskId, comment, timestamp, studentUsername)
          unread = unread.filter((comment, idx, arr) =>
            arr.findIndex(c =>
              c.taskId === comment.taskId &&
              c.comment === comment.comment &&
              c.timestamp === comment.timestamp &&
              c.studentUsername === comment.studentUsername
            ) === idx
          );
          
          console.log(`📊 [Dashboard-Student] Comentarios no leídos para ${user.username}: ${unread.length} (después de filtrado por asignaciones específicas)`);
          setUnreadCommentsCount(unread.length);
        } else if (user.role === 'teacher') {
          // 🎯 CORRECCIÓN CRÍTICA PARA PROFESORES: Solo mostrar comentarios de TAREAS CREADAS POR ESTE PROFESOR
          const storedTasks = localStorage.getItem('smart-student-tasks');
          const tasks = storedTasks ? JSON.parse(storedTasks) : [];
          
          // Filtrar tareas asignadas por este profesor ÚNICAMENTE
          const teacherTasks = tasks.filter((task: any) => task.assignedBy === user.username);
          const teacherTaskIds = teacherTasks.map((task: any) => task.id);
          
          console.log(`[Dashboard-Teacher] Profesor ${user.username} tiene ${teacherTasks.length} tareas asignadas`);
          console.log(`[Dashboard-Teacher] IDs de tareas del profesor: [${teacherTaskIds.join(', ')}]`);
          
          // Si no tiene tareas asignadas, no mostrar comentarios
          if (teacherTaskIds.length === 0) {
            console.log(`[Dashboard-Teacher] Profesor ${user.username} no tiene tareas asignadas - No mostrar comentarios`);
            setUnreadCommentsCount(0);
            return;
          }
          
          const users = JSON.parse(localStorage.getItem('smart-student-users') || '[]');
          
          let unread = comments.filter((comment: TaskComment) => {
            // 🎯 FILTRO PRINCIPAL: Solo comentarios de tareas de este profesor
            if (!teacherTaskIds.includes(comment.taskId)) {
              return false;
            }
            
            // 🔥 NUEVA LÓGICA: Usar authorUsername si existe, sino studentUsername (retrocompatibilidad)
            const actualAuthor = comment.authorUsername || comment.studentUsername;
            const actualAuthorRole = comment.authorRole;
            
            // Excluir comentarios propios del profesor
            if (actualAuthor === user.username) return false;
            
            // Excluir comentarios de entrega
            if (comment.isSubmission) return false;
            
            // Excluir si ya fue leído por este profesor
            if (comment.readBy?.includes(user.username)) return false;
            
            // 🎯 FILTRO ADICIONAL: Para tareas específicas, verificar que el estudiante esté asignado
            const task = tasks.find((t: any) => t.id === comment.taskId);
            if (task && task.assignedTo === 'student' && task.assignedStudentIds) {
              // Es una tarea específica - verificar que el estudiante esté asignado
              const studentData = users.find((u: any) => u.username === actualAuthor);
              if (!studentData || !task.assignedStudentIds.includes(studentData.id)) {
                console.log(`[Dashboard-Teacher] Filtrando comentario de ${actualAuthor} - NO asignado a tarea específica "${task.title}"`);
                return false;
              }
              console.log(`[Dashboard-Teacher] Permitiendo comentario de ${actualAuthor} - SÍ asignado a tarea específica "${task.title}"`);
            }
            
            // 🚨 FILTRO PRINCIPAL: Determinar el rol del autor
            let authorRole = actualAuthorRole;
            if (!authorRole) {
              const authorUser = users.find((u: any) => u.username === actualAuthor);
              authorRole = authorUser?.role;
            }
            
            // Solo incluir comentarios de estudiantes, NUNCA de otros profesores
            if (authorRole === 'teacher') {
              console.log(`[Dashboard-Teacher] Excluyendo comentario de profesor ${actualAuthor} para profesor ${user.username}`);
              return false;
            }
            
            if (authorRole !== 'student') {
              console.log(`[Dashboard-Teacher] Excluyendo comentario de role desconocido ${actualAuthor} (${authorRole}) para profesor ${user.username}`);
              return false;
            }
            
            return true;
          });

          // Eliminar duplicados
          unread = unread.filter((comment, idx, arr) =>
            arr.findIndex(c =>
              c.taskId === comment.taskId &&
              c.comment === comment.comment &&
              c.timestamp === comment.timestamp &&
              (c.authorUsername || c.studentUsername) === (comment.authorUsername || comment.studentUsername)
            ) === idx
          );
          
          console.log(`[Dashboard-Teacher] Profesor ${user.username}: ${unread.length} comentarios no leídos de sus tareas asignadas`);
          setUnreadCommentsCount(unread.length);
          
          // Para profesores, también cargar entregas pendientes
          loadPendingTaskSubmissions();
        }
      }
    }
  }, [user]);

  // Función para cargar notificaciones de tareas
  const loadTaskNotifications = () => {
    if (user) {
      // 🔥 CORRECCIÓN DIRECTA: Calcular desde localStorage para profesores como fallback
      if (user.role === 'teacher') {
        try {
          const notifications = JSON.parse(localStorage.getItem('smart-student-task-notifications') || '[]');
          
          // Filtrar notificaciones no leídas para este profesor usando la misma lógica que funcionó en el debug
          const teacherNotifications = notifications.filter((notif: any) => 
            notif.targetUserRole === 'teacher' &&
            (notif.targetUsernames?.includes(user.username) || notif.targetUsernames?.includes(user.id)) &&
            !notif.readBy?.includes(user.username) && !notif.readBy?.includes(user.id)
          );
          
          console.log(`� [Dashboard] DIRECT localStorage calculation for ${user.username}:`);
          console.log(`📋 Total notifications in localStorage: ${notifications.length}`);
          console.log(`📋 Teacher notifications (filtered): ${teacherNotifications.length}`);
          
          // Filtrar por tipos específicos para profesores
          const taskSubmissions = teacherNotifications.filter((n: any) => n.type === 'task_submission');
          const pendingGrading = teacherNotifications.filter((n: any) => n.type === 'pending_grading');
          const taskCompleted = teacherNotifications.filter((n: any) => n.type === 'task_completed');
          const evaluationCompleted = teacherNotifications.filter((n: any) => n.type === 'evaluation_completed'); // 🔥 NUEVO: Agregar evaluaciones completadas
          const teacherComments = teacherNotifications.filter((n: any) => n.type === 'teacher_comment');
          
          // 🔥 CORRECCIÓN: Usar la misma lógica de filtrado que getUnreadCountForUser
          const countableTypes = ['pending_grading', 'task_completed', 'task_submission', 'evaluation_completed', 'teacher_comment'];
          const countableNotifications = teacherNotifications.filter((n: any) => countableTypes.includes(n.type));
          const directCount = countableNotifications.length;
          
          console.log(`🔍 [Dashboard] DIRECT Breakdown:`, {
            'task_submission (Tareas Completadas)': taskSubmissions.length,
            'pending_grading': pendingGrading.length,
            'task_completed': taskCompleted.length, 
            'evaluation_completed': evaluationCompleted.length, // 🔥 NUEVO: Mostrar conteo de evaluaciones completadas
            'teacher_comment': teacherComments.length,
            'COUNTABLE NOTIFICATIONS': countableNotifications.length,
            'DIRECT TOTAL': directCount
          });
          
          // También intentar el TaskNotificationManager para comparar
          let managerCount = 0;
          try {
            managerCount = TaskNotificationManager.getUnreadCountForUser(user.username, 'teacher', user.id);
            console.log(`🔍 [Dashboard] TaskNotificationManager returned: ${managerCount}`);
          } catch (error) {
            console.warn(`⚠️ [Dashboard] TaskNotificationManager failed:`, error);
          }
          
          // 🔥 USAR directCount (corregido) como prioritario, managerCount solo como fallback
          const finalCount = directCount;
          console.log(`🎯 [Dashboard] Using final count: ${finalCount} (direct: ${directCount}, manager: ${managerCount})`);
          console.log(`🔍 [Dashboard] Prioritizing corrected directCount over TaskNotificationManager`);
          
          setTaskNotificationsCount(finalCount);
          
        } catch (error) {
          console.error('Error in direct notification calculation:', error);
          // Fallback al TaskNotificationManager original
          const count = TaskNotificationManager.getUnreadCountForUser(user.username, 'teacher', user.id);
          setTaskNotificationsCount(count);
        }
      } else {
        // Para estudiantes, usar TaskNotificationManager normal
        const count = TaskNotificationManager.getUnreadCountForUser(
          user.username, 
          user.role as 'student' | 'teacher',
          user.id
        );
        console.log(`🔔 [Dashboard] TaskNotifications - User ${user.username} (${user.role}) has ${count} unread task notifications`);
        setTaskNotificationsCount(count);
      }
    }
  };

  // Función para cargar solicitudes de contraseña pendientes
  const loadPendingPasswordRequests = () => {
    if (user && user.role === 'admin') {
      const storedRequests = localStorage.getItem('password-reset-requests');
      if (storedRequests) {
        const requests = JSON.parse(storedRequests);
        
        // Filtrar solicitudes pendientes
        const pendingRequests = requests.filter((req: any) => req.status === 'pending');
        
        setPendingPasswordRequestsCount(pendingRequests.length);
      } else {
        setPendingPasswordRequestsCount(0);
      }
    }
  };

  // Función para limpiar datos inconsistentes
  const cleanupInconsistentData = () => {
    try {
      // ✅ NUEVO: Limpiar notificaciones propias inconsistentes
      TaskNotificationManager.repairSelfNotifications();
      
      // ✅ NUEVO: Reparar notificaciones del sistema con fromUsername incorrecto
      TaskNotificationManager.repairSystemNotifications();
      
      // ✅ ESPECÍFICO: Limpiar notificaciones de comentarios propios del profesor
      TaskNotificationManager.cleanupOwnCommentNotifications();
      
      // ✅ ESPECÍFICO: Eliminar notificaciones de comentarios propios de profesores
      TaskNotificationManager.removeTeacherOwnCommentNotifications();
      
      // 🔥 NUEVO: Limpiar notificaciones cruzadas entre profesores
      TaskNotificationManager.removeCrossTeacherNotifications();
      
      // Limpiar notificaciones duplicadas o huérfanas
      const notifications = JSON.parse(localStorage.getItem('smart-student-task-notifications') || '[]');
      const tasks = JSON.parse(localStorage.getItem('smart-student-tasks') || '[]');
      const taskIds = tasks.map((t: any) => t.id);
      
      // Filtrar notificaciones válidas (que tengan tarea existente)
      const validNotifications = notifications.filter((n: any) => taskIds.includes(n.taskId));
      
      // Remover duplicados
      const uniqueNotifications = validNotifications.filter((notif: any, index: number, arr: any[]) => {
        const key = `${notif.type}_${notif.taskId}_${notif.fromUsername}_${notif.targetUsernames.join(',')}`;
        return arr.findIndex((n: any) => 
          `${n.type}_${n.taskId}_${n.fromUsername}_${n.targetUsernames.join(',')}` === key
        ) === index;
      });
      
      if (uniqueNotifications.length !== notifications.length) {
        console.log(`[Dashboard] Cleaned up ${notifications.length - uniqueNotifications.length} invalid/duplicate notifications`);
        localStorage.setItem('smart-student-task-notifications', JSON.stringify(uniqueNotifications));
      }
      
      // Limpiar comentarios huérfanos y duplicados
      const comments = JSON.parse(localStorage.getItem('smart-student-task-comments') || '[]');
      let validComments = comments.filter((c: any) => taskIds.includes(c.taskId));
      
      // Eliminar duplicados de comentarios/entregas
      const uniqueComments = validComments.filter((comment: any, index: number, arr: any[]) => {
        const key = `${comment.taskId}_${comment.studentUsername}_${comment.comment}_${comment.timestamp}_${comment.isSubmission}`;
        return arr.findIndex((c: any) => 
          `${c.taskId}_${c.studentUsername}_${c.comment}_${c.timestamp}_${c.isSubmission}` === key
        ) === index;
      });
      
      if (uniqueComments.length !== comments.length) {
        console.log(`[Dashboard] Cleaned up ${comments.length - uniqueComments.length} orphaned/duplicate comments`);
        localStorage.setItem('smart-student-task-comments', JSON.stringify(uniqueComments));
      }
    } catch (error) {
      console.error('Error cleaning up data:', error);
    }
  };

  // Cargar entregas pendientes para profesores para mostrar en las notificaciones
  const loadPendingTaskSubmissions = () => {
    if (user && user.role === 'teacher') {
      try {
        const storedComments = localStorage.getItem('smart-student-task-comments');
        const storedTasks = localStorage.getItem('smart-student-tasks');
        
        if (storedComments && storedTasks) {
          const comments = JSON.parse(storedComments);
          const tasks = JSON.parse(storedTasks);
          
          // Filtrar tareas asignadas por este profesor - usar múltiples criterios
          const teacherTasks = tasks.filter((task: any) => 
            task.assignedBy === user.username || 
            task.assignedById === user.id ||
            task.assignedBy === user.id ||
            task.assignedById === user.username
          );
          const teacherTaskIds = teacherTasks.map((task: any) => task.id);
          
          console.log(`[Dashboard] Teacher ${user.username} task filtering:`);
          console.log(`- Total tasks in localStorage: ${tasks.length}`);
          console.log(`- Tasks assigned by this teacher: ${teacherTasks.length}`);
          console.log(`- Teacher task IDs: [${teacherTaskIds.join(', ')}]`);
          
          if (teacherTasks.length > 0) {
            console.log('- Found teacher tasks:');
            teacherTasks.forEach((task: any, index: number) => {
              console.log(`  ${index + 1}. "${task.title}" (ID: ${task.id})`);
              console.log(`     - assignedBy: "${task.assignedBy}"`);
              console.log(`     - assignedById: "${task.assignedById}"`);
            });
          } else {
            console.warn(`⚠️ [Dashboard] No tasks found for teacher ${user.username}. Checking all tasks:`);
            tasks.forEach((task: any, index: number) => {
              console.log(`  Task ${index + 1}: "${task.title}"`);
              console.log(`    - assignedBy: "${task.assignedBy}"`);
              console.log(`    - assignedById: "${task.assignedById}"`);
            });
          }
          
          // Filtrar entregas sin calificar - ser más estricto con la validación
          // También excluir entregas propias del profesor
          let pendingSubmissions = comments.filter((comment: any) => 
            comment.isSubmission === true && 
            teacherTaskIds.includes(comment.taskId) &&
            comment.studentUsername !== user.username && // Excluir entregas propias del profesor
            (!comment.grade || comment.grade === null || comment.grade === undefined)
          );

          // Eliminar duplicados de entregas - Agrupar por estudiante y tarea (solo la entrega más reciente)
          // Esto asegura que una entrega con comentario se cuente como UN SOLO evento
          const uniqueSubmissions = pendingSubmissions.reduce((acc: any[], submission: any) => {
            const key = `${submission.taskId}_${submission.studentUsername}`;
            const existing = acc.find(s => `${s.taskId}_${s.studentUsername}` === key);
            
            if (!existing) {
              // Primera entrega para esta combinación tarea-estudiante
              acc.push(submission);
            } else {
              // Si ya existe, mantener la más reciente (por timestamp)
              if (new Date(submission.timestamp) > new Date(existing.timestamp)) {
                const index = acc.indexOf(existing);
                acc[index] = submission;
              }
            }
            
            return acc;
          }, []);

          pendingSubmissions = uniqueSubmissions;

          // Cargar comentarios de estudiantes (NO entregas) para tareas de este profesor
          // que no hayan sido leídos por el profesor y que no sean propios
          // ✅ MEJORA: Evitar duplicados con notificaciones del sistema
          const studentComments = comments.filter((comment: any) => {
            if (comment.isSubmission || // Solo comentarios, no entregas
                !teacherTaskIds.includes(comment.taskId) || // Solo para tareas del profesor
                comment.studentUsername === user.username || // Excluir comentarios propios
                comment.readBy?.includes(user.username)) { // Ya leídos
              return false;
            }
            
            // ✅ NUEVA VALIDACIÓN: No incluir comentarios que ya están en las notificaciones del sistema
            const alreadyInNotifications = TaskNotificationManager.getNotifications().some((notif: any) => 
              notif.type === 'teacher_comment' && 
              notif.taskId === comment.taskId &&
              notif.fromUsername === comment.studentUsername &&
              !notif.readBy.includes(user.username) &&
              // Verificar que el timestamp sea similar (dentro de 1 minuto)
              Math.abs(new Date(notif.timestamp).getTime() - new Date(comment.timestamp).getTime()) < 60000
            );
            
            return !alreadyInNotifications;
          });
          
          console.log(`[Dashboard] Teacher ${user.username} analysis:`);
          console.log(`- Total tasks assigned: ${teacherTasks.length}`);
          console.log(`- Task IDs: [${teacherTaskIds.join(', ')}]`);
          console.log(`- Total submissions: ${comments.filter((c: any) => c.isSubmission && teacherTaskIds.includes(c.taskId)).length}`);
          console.log(`- Ungraded submissions: ${pendingSubmissions.length}`);
          console.log(`- Unread student comments: ${studentComments.length}`);
          
          if (pendingSubmissions.length > 0) {
            console.log('Ungraded submissions details:');
            pendingSubmissions.forEach((sub: any, index: number) => {
              const task = tasks.find((t: any) => t.id === sub.taskId);
              console.log(`  ${index + 1}. ${sub.studentName} - "${task?.title || 'Unknown'}" - Grade: ${sub.grade} (${typeof sub.grade})`);
            });
          }

          if (studentComments.length > 0) {
            console.log('Unread student comments details:');
            studentComments.forEach((comment: any, index: number) => {
              const task = tasks.find((t: any) => t.id === comment.taskId);
              console.log(`  ${index + 1}. ${comment.studentName} - "${task?.title || 'Unknown'}" - Comment: "${comment.comment.substring(0, 50)}..."`);
            });
          }
          
          setPendingTaskSubmissionsCount(pendingSubmissions.length);
          setUnreadStudentCommentsCount(studentComments.length);
          
          // ✅ MEJORA: Disparar eventos para sincronizar el panel de notificaciones
          console.log(`[Dashboard] Triggering notification sync events for updated counts`);
          window.dispatchEvent(new CustomEvent('notificationsUpdated', { 
            detail: { 
              type: 'teacher_counters_updated',
              unreadStudentCommentsCount: studentComments.length,
              pendingTaskSubmissionsCount: pendingSubmissions.length
            } 
          }));
        } else {
          console.log(`[Dashboard] No stored data found for teacher ${user.username}`);
          setPendingTaskSubmissionsCount(0);
          setUnreadStudentCommentsCount(0);
        }
      } catch (error) {
        console.error('Error loading pending submissions:', error);
        setPendingTaskSubmissionsCount(0);
        setUnreadStudentCommentsCount(0);
      }
    } else {
      setPendingTaskSubmissionsCount(0);
      setUnreadStudentCommentsCount(0);
    }
  };

  // Función para cargar tareas pendientes reales
  const loadPendingTasks = () => {
    if (user) {
      const storedTasks = localStorage.getItem('smart-student-tasks');
      if (storedTasks) {
        const tasks = JSON.parse(storedTasks);
        const storedComments = localStorage.getItem('smart-student-task-comments');
        const comments = storedComments ? JSON.parse(storedComments) : [];
        
        if (user.role === 'student') {
          // Para estudiantes: contar tareas asignadas que aún no han sido completadas/entregadas
          const studentTasks = tasks.filter((task: any) => {
            if (task.assignedTo === 'course' && task.course === (user as any).course) {
              return true;
            }
            if (task.assignedTo === 'specific' && task.assignedStudents?.includes(user.username)) {
              return true;
            }
            return false;
          });
          
          // Contar tareas que no tienen entrega o están pendientes de calificación
          const pendingTasks = studentTasks.filter((task: any) => {
            const submissions = comments.filter((comment: any) => 
              comment.taskId === task.id && 
              comment.studentUsername === user.username && 
              comment.isSubmission
            );
            
            // Si no hay entregas, la tarea está pendiente
            if (submissions.length === 0) return true;
            
            // Si hay entregas pero no están calificadas, también está pendiente
            const latestSubmission = submissions[submissions.length - 1];
            return !latestSubmission.grade;
          });
          
          setPendingTasksCount(pendingTasks.length);
          console.log(`[Dashboard] Student ${user.username} has ${pendingTasks.length} pending tasks`);
          
        } else if (user.role === 'teacher') {
          // Para profesores, el contador de tareas pendientes no se usa (solo se usa pendingTaskSubmissionsCount)
          setPendingTasksCount(0);
          console.log(`[Dashboard] Teacher ${user.username} - pendingTasksCount for card set to 0 (only pendingTaskSubmissionsCount is used)`);
        }
      } else {
        setPendingTasksCount(0);
      }
    }
  };

  // Función para cargar tareas pendientes del profesor (estado 'pending')
  const loadPendingTeacherTasks = () => {
    if (user && user.role === 'teacher') {
      try {
        const storedTasks = localStorage.getItem('smart-student-tasks');
        if (storedTasks) {
          const tasks = JSON.parse(storedTasks);
          
          // Filtrar tareas creadas por este profesor que están en estado 'pending' - usar múltiples criterios
          const pendingTasks = tasks.filter((task: any) => 
            (task.assignedById === user.id || 
             task.assignedBy === user.username ||
             task.assignedById === user.username ||
             task.assignedBy === user.id) &&
            task.status === 'pending'
          );
          
          console.log(`[Dashboard] Teacher ${user.username} has ${pendingTasks.length} pending tasks`);
          
          // Usar el estado existente pendingTasksCount para mostrar las tareas pendientes
          setPendingTasksCount(pendingTasks.length);
        } else {
          setPendingTasksCount(0);
        }
      } catch (error) {
        console.error('Error loading pending teacher tasks:', error);
        setPendingTasksCount(0);
      }
    }
  };

  // Cargar solicitudes de contraseña pendientes y entregas pendientes, y actualizar la cuenta de comentarios
  useEffect(() => {
    // Primero limpiar datos inconsistentes
    cleanupInconsistentData();
    
    // Luego cargar los contadores
    loadPendingPasswordRequests();
    loadPendingTaskSubmissions();
    loadTaskNotifications();
    loadPendingTasks();
  loadUnreadCommunicationsCount();
    
    // 🔔 NUEVA FUNCIONALIDAD: Cargar tareas pendientes del profesor para notificaciones
    if (user?.role === 'teacher') {
      loadPendingTeacherTasks();
    }
    
    // Escuchar cambios en localStorage para actualizar los contadores en tiempo real
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'password-reset-requests') {
        loadPendingPasswordRequests();
      }
      if (e.key === 'smart-student-task-comments') {
        if (user?.role === 'student') {
          // Recargar comentarios no leídos para estudiantes
          const storedComments = localStorage.getItem('smart-student-task-comments');
          if (storedComments) {
            const comments = JSON.parse(storedComments);
            let unread = comments.filter((comment: any) => 
              comment.studentUsername !== user.username && 
              (!comment.readBy?.includes(user.username)) &&
              !comment.isSubmission // NUEVO: Excluir comentarios de entrega
            );

            // Eliminar duplicados de comentarios del profesor
            unread = unread.filter((comment: any, idx: number, arr: any[]) =>
              arr.findIndex((c: any) =>
                c.taskId === comment.taskId &&
                c.comment === comment.comment &&
                c.timestamp === comment.timestamp &&
                c.studentUsername === comment.studentUsername
              ) === idx
            );
            setUnreadCommentsCount(unread.length);
          }
        } else if (user?.role === 'teacher') {
          // Recargar entregas pendientes para profesores
          loadPendingTaskSubmissions();
        }
      }
      
      // 🔔 NUEVA FUNCIONALIDAD: Escuchar cambios en tareas para actualizar tareas pendientes del profesor
      if (e.key === 'smart-student-tasks') {
        if (user?.role === 'teacher') {
          loadPendingTeacherTasks();
        }
        // También actualizar otras métricas relacionadas con tareas
        loadPendingTasks();
        loadPendingTaskSubmissions();
      }
      if (e.key === 'smart-student-communications' || e.key === 'smart-student-student-assignments' || e.key === 'smart-student-courses') {
        loadUnreadCommunicationsCount();
      }
      // Recalcular asistencia pendiente del profesor si cambian datos relevantes
      if (
        e.key === 'smart-student-attendance' ||
        e.key === 'smart-student-teacher-assignments' ||
        e.key === 'smart-student-sections' ||
        e.key === 'smart-student-courses'
      ) {
        computePendingAttendanceCount();
      }
    };
    
    // Función para manejar el evento personalizado cuando se marcan comentarios como leídos
    const handleCommentsUpdated = () => {
      console.log('🔄 [Dashboard] handleCommentsUpdated triggered');
      
      if (user?.role === 'student') {
        // Recargar comentarios no leídos para estudiantes
        const storedComments = localStorage.getItem('smart-student-task-comments');
        if (storedComments) {
          const comments = JSON.parse(storedComments);
          let unread = comments.filter((comment: any) => 
            comment.studentUsername !== user.username && 
            (!comment.readBy?.includes(user.username)) &&
            !comment.isSubmission // NUEVO: Excluir comentarios de entrega
          );

          // Eliminar duplicados de comentarios del profesor
          unread = unread.filter((comment: any, idx: number, arr: any[]) =>
            arr.findIndex((c: any) =>
              c.taskId === comment.taskId &&
              c.comment === comment.comment &&
              c.timestamp === comment.timestamp &&
              c.studentUsername === comment.studentUsername
            ) === idx
          );
          
          const newCount = unread.length;
          console.log(`🔔 [Dashboard] Student ${user.username} - updating unread comments count from ${unreadCommentsCount} to ${newCount}`);
          setUnreadCommentsCount(newCount);
          
          // 🔥 NUEVA MEJORA: Disparar evento para actualizar el panel de notificaciones
          window.dispatchEvent(new CustomEvent('updateDashboardCounts', { 
            detail: { 
              type: 'student_comments_updated',
              newCount: newCount,
              oldCount: unreadCommentsCount
            } 
          }));
        }
        // También actualizar tareas pendientes cuando hay cambios en comentarios
        loadPendingTasks();
      } else if (user?.role === 'teacher') {
        // Recargar entregas pendientes para profesores
        loadPendingTaskSubmissions();
        loadPendingTasks();
      }
    };

    // Función para manejar el evento personalizado de notificaciones de tareas
    const handleTaskNotificationsUpdated = () => {
      loadTaskNotifications();
      loadPendingTasks(); // También actualizar el contador de tareas pendientes
      
      // 🔔 NUEVA FUNCIONALIDAD: Actualizar tareas pendientes del profesor
      if (user?.role === 'teacher') {
        loadPendingTeacherTasks();
      }
    };

    // ✅ NUEVO: Listener para actualizaciones de conteo desde el panel de notificaciones
    const handleDashboardCountsUpdate = (event: CustomEvent) => {
      console.log(`[Dashboard] Received count update request from notifications panel:`, event.detail);
      
      // Recargar todos los contadores según el rol
      if (user?.role === 'teacher') {
        loadPendingTaskSubmissions();
        loadTaskNotifications();
        loadPendingTeacherTasks();
        computePendingAttendanceCount();
      } else if (user?.role === 'student') {
        // Recargar comentarios no leídos
        const storedComments = localStorage.getItem('smart-student-task-comments');
        if (storedComments) {
          const comments = JSON.parse(storedComments);
          let unread = comments.filter((comment: any) => 
            comment.studentUsername !== user.username && 
            (!comment.readBy?.includes(user.username)) &&
            !comment.isSubmission
          );

          unread = unread.filter((comment: any, idx: number, arr: any[]) =>
            arr.findIndex((c: any) =>
              c.taskId === comment.taskId &&
              c.comment === comment.comment &&
              c.timestamp === comment.timestamp &&
              c.studentUsername === comment.studentUsername
            ) === idx
          );
          setUnreadCommentsCount(unread.length);
        }
        
        loadPendingTasks();
        loadTaskNotifications();
  loadUnreadCommunicationsCount();
      } else if (user?.role === 'guardian') {
        // 🔧 NUEVO: Recargar comunicaciones no leídas para apoderados
        loadUnreadCommunicationsCount();
      } else if (user?.role === 'admin') {
        loadPendingPasswordRequests();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('commentsUpdated', handleCommentsUpdated);
    window.addEventListener('taskNotificationsUpdated', handleTaskNotificationsUpdated);
    window.addEventListener('updateDashboardCounts', handleDashboardCountsUpdate as EventListener);
    
    // 🔥 NUEVO: Listener para cuando se califica una tarea
    const handleTaskGraded = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('🎯 [Dashboard] handleTaskGraded triggered:', customEvent.detail);
      
      // Actualizar contadores para estudiantes cuando se califica su tarea
      if (user?.role === 'student') {
        loadPendingTasks(); // Actualizar tareas pendientes
        loadTaskNotifications(); // Actualizar notificaciones
      }
    };
    window.addEventListener('taskGraded', handleTaskGraded);
    
    // 🔥 NUEVA MEJORA: Listener específico para actualizaciones de comentarios de estudiantes
    const handleStudentCommentsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('🔄 [Dashboard] handleStudentCommentsUpdated triggered:', customEvent.detail);
      
      if (user?.role === 'student' && customEvent.detail.username === user.username) {
        // Forzar recarga inmediata del conteo de comentarios
        setTimeout(() => {
          const storedComments = localStorage.getItem('smart-student-task-comments');
          if (storedComments) {
            const comments = JSON.parse(storedComments);
            let unread = comments.filter((comment: any) => 
              comment.studentUsername !== user.username && 
              (!comment.readBy?.includes(user.username)) &&
              !comment.isSubmission
            );

            // Eliminar duplicados
            unread = unread.filter((comment: any, idx: number, arr: any[]) =>
              arr.findIndex((c: any) =>
                c.taskId === comment.taskId &&
                c.comment === comment.comment &&
                c.timestamp === comment.timestamp &&
                c.studentUsername === comment.studentUsername
              ) === idx
            );
            
            const newCount = unread.length;
            console.log(`🔔 [Dashboard] Force updating student comments count to ${newCount}`);
            setUnreadCommentsCount(newCount);
          }
        }, 100); // Pequeño delay para asegurar que localStorage se haya actualizado
      }
    };

    // 🔥 NUEVA MEJORA: Listener para cuando se cierra el diálogo de tareas
    const handleTaskDialogClosed = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('🔄 [Dashboard] handleTaskDialogClosed triggered:', customEvent.detail);
      
      if (user?.role === 'student' && customEvent.detail.username === user.username) {
        console.log('🔔 [Dashboard] Student closed task dialog - forcing comment count update');
        
        // Forzar recarga inmediata del conteo de comentarios después de cerrar el diálogo
        setTimeout(() => {
          const storedComments = localStorage.getItem('smart-student-task-comments');
          if (storedComments) {
            const comments = JSON.parse(storedComments);
            let unread = comments.filter((comment: any) => 
              comment.studentUsername !== user.username && 
              (!comment.readBy?.includes(user.username)) &&
              !comment.isSubmission
            );

            // Eliminar duplicados
            unread = unread.filter((comment: any, idx: number, arr: any[]) =>
              arr.findIndex((c: any) =>
                c.taskId === comment.taskId &&
                c.comment === comment.comment &&
                c.timestamp === comment.timestamp &&
                c.studentUsername === comment.studentUsername
              ) === idx
            );
            
            const newCount = unread.length;
            console.log(`🔔 [Dashboard] Updating student comments count after dialog close: ${newCount}`);
            setUnreadCommentsCount(newCount);
            
            // Disparar evento para actualizar el panel de notificaciones
            window.dispatchEvent(new CustomEvent('updateDashboardCounts', { 
              detail: { 
                type: 'student_comments_updated_dialog_closed',
                newCount: newCount,
                action: 'task_dialog_closed'
              } 
            }));
          }
        }, 200); // Delay más largo para asegurar que localStorage se haya actualizado
      }
    };

    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('commentsUpdated', handleCommentsUpdated);
    window.addEventListener('taskNotificationsUpdated', handleTaskNotificationsUpdated);
    window.addEventListener('updateDashboardCounts', handleDashboardCountsUpdate as EventListener);
    window.addEventListener('studentCommentsUpdated', handleStudentCommentsUpdated as EventListener);
    window.addEventListener('taskDialogClosed', handleTaskDialogClosed as EventListener);
    // Comunicaciones: escuchar eventos dedicados
    const handleStudentCommunicationsUpdated = () => {
      loadUnreadCommunicationsCount();
    };
    window.addEventListener('studentCommunicationsUpdated', handleStudentCommunicationsUpdated as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('commentsUpdated', handleCommentsUpdated);
      window.removeEventListener('taskNotificationsUpdated', handleTaskNotificationsUpdated);
      window.removeEventListener('updateDashboardCounts', handleDashboardCountsUpdate as EventListener);
      window.removeEventListener('studentCommentsUpdated', handleStudentCommentsUpdated as EventListener);
      window.removeEventListener('taskDialogClosed', handleTaskDialogClosed as EventListener);
      window.removeEventListener('taskGraded', handleTaskGraded); // 🔥 NUEVO: Remover listener taskGraded
  window.removeEventListener('studentCommunicationsUpdated', handleStudentCommunicationsUpdated as EventListener);
    };
  }, [user]);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200 hover:bg-gray-100 hover:text-red-800 transition-colors duration-200'; // NotificationBadge: hover fondo gris claro
      case 'teacher': return 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-gray-100 hover:text-blue-800 transition-colors duration-200'; // NotificationBadge: hover fondo gris claro
      case 'student': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 border-green-200 dark:border-green-700 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors duration-200';
      case 'guardian': return 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-gray-100 hover:text-purple-800 transition-colors duration-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200 border-gray-200 dark:border-gray-700';
    }
  };

  const getButtonColorClass = (color: string) => {
    switch (color) {
      case 'green': return 'home-card-button-green';
      case 'blue': return 'home-card-button-blue';
      case 'yellow': return 'home-card-button-yellow';
  case 'lime': return 'home-card-button-lime';
      case 'cyan': return 'home-card-button-cyan';
      case 'purple': return 'home-card-button-purple';
      case 'orange': return 'home-card-button-orange';
      case 'red': return 'home-card-button-red';
      case 'indigo': return 'home-card-button-indigo';
      case 'teal': return 'home-card-button-teal';
  case 'rose': return 'home-card-button-stats';
  case 'fuchsia': return 'home-card-button-fuchsia';
      case 'emerald': return 'home-card-button-emerald';
  case 'gray': return 'home-card-button-gray';
  case 'silver': return 'home-card-button-silver';
  case 'stone': return 'home-card-button-stone';
  case 'amber': return 'home-card-button-amber';
  case 'mint': return 'home-card-button-mint';
      default: return '';
    }
  };
  
  const getIconColorClass = (color: string) => {
    switch (color) {
      case 'green': return 'text-green-500 dark:text-green-400';
      case 'blue': return 'text-blue-500 dark:text-blue-400';
      case 'yellow': return 'text-yellow-500 dark:text-yellow-400';
  case 'lime': return 'text-lime-500 dark:text-lime-400';
      case 'cyan': return 'text-cyan-500 dark:text-cyan-400';
      case 'purple': return 'text-purple-500 dark:text-purple-400';
      case 'orange': return 'text-orange-500 dark:text-orange-400';
      case 'red': return 'text-red-500 dark:text-red-400';
      case 'indigo': return 'text-indigo-500 dark:text-indigo-400';
      case 'teal': return 'text-teal-500 dark:text-teal-400';
      case 'rose': return 'text-rose-500 dark:text-rose-400';
  case 'fuchsia': return 'text-fuchsia-500 dark:text-fuchsia-400';
      case 'emerald': return 'text-emerald-500 dark:text-emerald-400';
  case 'gray': return 'text-gray-600 dark:text-gray-300';
  case 'silver': return 'text-zinc-400 dark:text-zinc-300';
  // Stone (Calificaciones): subir un tono en light para diferenciarse de silver
  case 'stone': return 'text-stone-600 dark:text-stone-400';
  case 'amber': return 'text-amber-500 dark:text-amber-400';
  case 'mint': return 'text-emerald-400 dark:text-emerald-300';
      default: return 'text-muted-foreground';
    }
  };

  const getBorderColorClass = (color: string) => {
    switch (color) {
      case 'green': return 'border-green-200 dark:border-green-800';
      case 'blue': return 'border-blue-200 dark:border-blue-800';
      case 'yellow': return 'border-yellow-200 dark:border-yellow-800';
  case 'lime': return 'border-lime-200 dark:border-lime-800';
      case 'cyan': return 'border-cyan-200 dark:border-cyan-800';
      case 'purple': return 'border-purple-200 dark:border-purple-800';
      case 'orange': return 'border-orange-200 dark:border-orange-800';
      case 'red': return 'border-red-200 dark:border-red-800';
      case 'indigo': return 'border-indigo-200 dark:border-indigo-800';
      case 'teal': return 'border-teal-200 dark:border-teal-800';
      case 'rose': return 'border-rose-200 dark:border-rose-800';
  case 'fuchsia': return 'border-fuchsia-200 dark:border-fuchsia-800';
      case 'emerald': return 'border-emerald-200 dark:border-emerald-800';
  case 'gray': return 'border-gray-200 dark:border-gray-800';
  case 'silver': return 'border-zinc-300 dark:border-zinc-600';
  // Stone (Calificaciones): borde más visible para distinguir de Calendario (silver)
  case 'stone': return 'border-stone-400 dark:border-stone-600';
  case 'amber': return 'border-amber-300 dark:border-amber-700';
  case 'mint': return 'border-emerald-300 dark:border-emerald-600';
      default: return 'border-gray-200 dark:border-gray-800';
    }
  };

  // Helper para renderizar una tarjeta de feature reutilizando el mismo contenido/badges
  const renderFeatureCard = (card: any) => {
    if (!card) return null;
    return (
      <Card key={card.titleKey} className={`flex flex-col text-center shadow-sm hover:shadow-lg transition-shadow duration-300 ${getBorderColorClass(card.colorClass)}`}>
        <CardHeader className="items-center relative">
          {card.showBadge && card.titleKey === 'cardTasksTitle' && (
            (() => {
              let totalTaskCount;

              if (user?.role === 'student') {
                totalTaskCount = pendingTasksCount + unreadCommentsCount + taskNotificationsCount;
              } else {
                const notifications = JSON.parse(localStorage.getItem('smart-student-task-notifications') || '[]');
                const teacherNotificationsExcludingSubmissions = notifications.filter((notif: any) =>
                  notif.targetUserRole === 'teacher' &&
                  user && (notif.targetUsernames?.includes(user.username) || notif.targetUsernames?.includes(user.id)) &&
                  user && (!notif.readBy?.includes(user.username) && !notif.readBy?.includes(user.id)) &&
                  notif.type !== 'task_submission'
                ).length;

                totalTaskCount = pendingTaskSubmissionsCount + unreadStudentCommentsCount + teacherNotificationsExcludingSubmissions;
              }

              return totalTaskCount > 0 && (
                user?.role === 'student' ? (
                  <Badge 
                    className="absolute -top-2 -right-2 bg-red-500 text-white hover:bg-red-600 text-xs px-2 rounded-full"
                    title={translate('pendingTasksAndNotifications', { count: String(totalTaskCount) }) || `${totalTaskCount} tareas/notificaciones pendientes`}
                  >
                    {totalTaskCount > 99 ? '99+' : totalTaskCount}
                  </Badge>
                ) : (
                  <Badge 
                    className="absolute -top-2 -right-2 bg-red-500 text-white hover:bg-red-600 text-xs px-2 rounded-full"
                    title={translate('pendingGradingAndNotifications', { count: String(totalTaskCount) }) || `${totalTaskCount} calificaciones/notificaciones pendientes`}
                  >
                    {totalTaskCount > 99 ? '99+' : totalTaskCount}
                  </Badge>
                )
              );
            })()
          )}
          {(user?.role === 'student' || user?.role === 'guardian') && card.titleKey === 'cardCommunicationsStudentTitle' && unreadCommunicationsCount > 0 && (
            <Badge 
              className="absolute -top-2 -right-2 bg-red-500 text-white hover:bg-red-600 text-xs px-2 rounded-full"
              title={translate('unreadCommunicationsBadge', { count: String(unreadCommunicationsCount) }) || `${unreadCommunicationsCount} comunicaciones sin leer`}
            >
              {unreadCommunicationsCount > 99 ? '99+' : unreadCommunicationsCount}
            </Badge>
          )}
          <card.icon className={`w-10 h-10 mb-3 ${getIconColorClass(card.colorClass)}`} />
          <CardTitle className="text-lg font-semibold font-headline">{translate(card.titleKey)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col flex-grow">
          <CardDescription className="text-sm mb-4 flex-grow">
            {translate(card.descKey)}
          </CardDescription>
          <Button
            variant="outline"
            asChild
            className={cn(
              "home-card-button",
              getButtonColorClass(card.colorClass),
              "hover:shadow-lg transition-shadow duration-200"
            )}
          >
            <Link href={card.targetPage}>
              {card.titleKey === 'cardCommunicationsStudentTitle' && user?.role === 'teacher' 
                ? 'Crear Comunicados' 
                : translate(card.btnKey)
              }
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  };

  // Helper para renderizar tarjetas específicas del profesor (asistencia/estadísticas)
  const renderTeacherCard = (card: any) => {
    if (!card) return null;
    return (
      <Card 
        key={card.titleKey} 
        className={`flex flex-col text-center shadow-sm hover:shadow-lg transition-shadow duration-300 ${
          card.colorClass === 'rose' 
            ? 'border-rose-200 dark:border-rose-800' 
            : card.colorClass === 'indigo' 
              ? 'border-indigo-200 dark:border-indigo-800'
              : card.colorClass === 'emerald'
                ? 'border-emerald-200 dark:border-emerald-800'
                : 'border-gray-200 dark:border-gray-800'
        }`}
      >
        <CardHeader className="items-center relative">
          {card.showBadge && card.titleKey === 'cardAttendanceTitle' && pendingAttendanceCount > 0 && (
            <Badge 
              className="absolute -top-2 -right-2 bg-red-500 text-white hover:bg-red-600 text-xs px-2 rounded-full"
              title={`${pendingAttendanceCount} pendientes de asistencia hoy`}
            >
              {pendingAttendanceCount > 99 ? '99+' : pendingAttendanceCount}
            </Badge>
          )}
          <card.icon className={`w-10 h-10 mb-3 ${getIconColorClass(card.colorClass)}`} />
          <CardTitle className="text-lg font-semibold font-headline">{translate(card.titleKey)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col flex-grow">
          <CardDescription className="text-sm mb-4 flex-grow">
            {translate(card.descKey)}
          </CardDescription>
      <Button
            variant="outline"
            asChild
            className={cn(
              "home-card-button",
        // Mantener color característico; el efecto (sombra/escala) se replica en CSS de la clase stats
        getButtonColorClass(card.colorClass),
              "hover:shadow-lg transition-shadow duration-200"
            )}
          >
            <Link href={card.targetPage}>{translate(card.btnKey)}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-start gap-3">
            <h1 className="text-3xl font-bold text-foreground font-headline">
              {translate('welcomeMessage', { 
                name: user?.displayName 
                  ? user.displayName.charAt(0).toUpperCase() + user.displayName.slice(1).toLowerCase()
                  : 'Usuario' 
              })}
            </h1>
            <Home className="w-8 h-8 text-foreground" />
          </div>
          {user && (
            <div className="flex items-center gap-3">
              {/* User Role Badge */}
              <Badge className={cn("text-xs font-medium px-2 py-1 inline-flex items-center gap-1.5", getRoleBadgeColor(user.role))}>
                {user.role === 'admin' && (
                  <Crown className="w-3 h-3 text-red-700 dark:text-red-400 flex-shrink-0" />
                )}
                {user.role === 'teacher' && (
                  <Shield className="w-3 h-3 text-blue-700 dark:text-blue-400 flex-shrink-0" />
                )}
                {user.role === 'student' && (
                  <GraduationCap className="w-3 h-3 text-green-500 dark:text-green-400 flex-shrink-0" />
                )}
                {user.role === 'guardian' && (
                  <Users className="w-3 h-3 text-purple-700 dark:text-purple-400 flex-shrink-0" />
                )}
                {user.role === 'admin' && translate('adminRole')}
                {user.role === 'teacher' && translate('teacherRole')}
                {user.role === 'student' && translate('studentRole')}
                {user.role === 'guardian' && translate('guardianRole')}
              </Badge>
              {/* Notification Panel */}
              <NotificationsPanel count={
                (() => {
                  // 🔧 CORRECCIÓN: Evitar duplicación de entregas en el contador del profesor
                  let totalCount;
                  
                  if (user.role === 'admin') {
                    totalCount = pendingPasswordRequestsCount;
                  } else if (user.role === 'teacher') {
                    // Para profesores: solo usar entregas + comentarios + notificaciones del sistema (excluyendo task_submission)
                    // porque pendingTaskSubmissionsCount ya cuenta las entregas directamente desde localStorage
                    
                    // Calcular taskNotificationsCount sin incluir task_submission Y task_completed para evitar duplicación
                    const notifications = JSON.parse(localStorage.getItem('smart-student-task-notifications') || '[]');
                    const teacherNotificationsExcludingDuplicates = notifications.filter((notif: any) => 
                      notif.targetUserRole === 'teacher' &&
                      (notif.targetUsernames?.includes(user.username) || notif.targetUsernames?.includes(user.id)) &&
                      (!notif.readBy?.includes(user.username) && !notif.readBy?.includes(user.id)) &&
                      notif.type !== 'task_submission' && // 🔧 EXCLUIR task_submission para evitar duplicación
                      notif.type !== 'task_completed' // 🔧 EXCLUIR task_completed para evitar duplicación
                    ).length;
                    // Leer total de asistencia pendiente agregado por curso desde panel (almacenado en local para sincronía)
                    let attendanceTotal = 0;
                    try {
                      const raw = localStorage.getItem('smart-student-attendance-pending-total');
                      if (raw) attendanceTotal = Number(raw) || 0;
                    } catch {}

                    totalCount = pendingTaskSubmissionsCount + unreadStudentCommentsCount + teacherNotificationsExcludingDuplicates + (attendanceTotal || pendingAttendanceCount); // ➕ incluir días pendientes acumulados
                  } else if (user.role === 'guardian') {
                    // Para apoderados: solo comunicaciones no leídas de sus estudiantes
                    totalCount = unreadCommunicationsCount;
                  } else {
                    // Para estudiantes: sumar comunicaciones no leídas
                    totalCount = pendingTasksCount + unreadCommentsCount + taskNotificationsCount + unreadCommunicationsCount;
                  }
                  
                  // ✅ LOGS DE DEBUG MEJORADOS
                  console.log(`🔔 [Dashboard] NOTIFICATION PANEL CALCULATION FOR ${user.username} (${user.role}):`);
                  console.log(`  • pendingTaskSubmissionsCount: ${pendingTaskSubmissionsCount}`);
                  console.log(`  • unreadStudentCommentsCount: ${unreadStudentCommentsCount}`);
                  if (user.role === 'teacher') {
                    const teacherNotificationsExcludingDuplicates = JSON.parse(localStorage.getItem('smart-student-task-notifications') || '[]')
                      .filter((notif: any) => 
                        notif.targetUserRole === 'teacher' &&
                        (notif.targetUsernames?.includes(user.username) || notif.targetUsernames?.includes(user.id)) &&
                        (!notif.readBy?.includes(user.username) && !notif.readBy?.includes(user.id)) &&
                        notif.type !== 'task_submission' &&
                        notif.type !== 'task_completed'
                      ).length;
                    console.log(`  • taskNotificationsCount (excluding task_submission & task_completed): ${teacherNotificationsExcludingDuplicates} ⭐ (FIXED: no duplicates)`);
                    console.log(`  • taskNotificationsCount (original): ${taskNotificationsCount} ⚠️ (included duplicates)`);
                    const attendanceTotal = Number(localStorage.getItem('smart-student-attendance-pending-total') || '0');
                    console.log(`  • pendingAttendanceCount (today): ${pendingAttendanceCount} ➕`);
                    console.log(`  • pendingAttendanceTotal (year-to-date working days): ${attendanceTotal} ➕ (included in bell)`);
                  } else if (user.role === 'guardian') {
                    console.log(`  • unreadCommunicationsCount: ${unreadCommunicationsCount} 📧`);
                  } else {
                    console.log(`  • taskNotificationsCount: ${taskNotificationsCount} ⭐ (includes evaluation_completed)`);
                  }
                  console.log(`  • pendingTasksCount: ${pendingTasksCount}`);
                  console.log(`  • unreadCommentsCount: ${unreadCommentsCount}`);
                  if (user.role === 'student' || user.role === 'guardian') {
                    console.log(`  • unreadCommunicationsCount: ${unreadCommunicationsCount}`);
                  }
                  console.log(`  🎯 NOTIFICATION PANEL TOTAL COUNT: ${totalCount}`);
                  
                  // ✅ VERIFICACIÓN ADICIONAL
                  if (totalCount === 0 && user.role === 'teacher') {
                    console.warn(`⚠️ [Dashboard] WARNING: Teacher has 0 notifications. This might be incorrect.`);
                  }
                  
                  return totalCount;
                })()
              } />
            </div>
          )}
        </div>
      </div>

      {/* Layout: si es profesor, agrupar en filas específicas sin cambiar tamaño de tarjetas */}
      {user?.role === 'teacher' ? (
        <>
          {/* Fila 1: Libros, Resúmenes, Mapa, Cuestionario, Evaluación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {['cardBooksTitle','cardSummaryTitle','cardMapTitle','cardQuizTitle','cardEvalTitle']
              .map(key => featureCards.find(c => c.titleKey === key))
              .map(card => renderFeatureCard(card))}
          </div>

          {/* Fila 2: Tareas, Pruebas, Slides (mismas dimensiones que Libros) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {['cardTasksTitle','cardTestsTitle','cardSlidesTitle']
              .map(key => featureCards.find(c => c.titleKey === key))
              .map(card => renderFeatureCard(card))}
          </div>

          {/* Fila 3: Comunicaciones, Asistencia, Estadística (mismas dimensiones que Libros) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {/* Comunicaciones (desde featureCards) */}
            {renderFeatureCard(featureCards.find(c => c.titleKey === 'cardCommunicationsStudentTitle'))}
            {/* Asistencia y Estadísticas (desde teacherCards) */}
            {renderTeacherCard(teacherCards.find(c => c.titleKey === 'cardAttendanceTitle'))}
            {/* Calificaciones para profesores: misma página que Admin, justo después de Asistencia */}
            {renderTeacherCard(teacherCards.find(c => c.titleKey === 'cardGradesTitle'))}
            {/* Oculto: tarjeta Estadísticas no se muestra para profesor */}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {featureCards
            .filter(card => {
              if (card.titleKey === 'cardCommunicationsStudentTitle' && user?.role === 'admin') {
                return false;
              }
              // Ocultar tarjeta de Tareas para rol admin y guardian
              if (card.titleKey === 'cardTasksTitle' && (user?.role === 'admin' || user?.role === 'guardian')) {
                return false;
              }
              // Ocultar Calificaciones del bloque general cuando es admin o guardian (se muestra en adminCards/guardianCards)
              if (card.titleKey === 'cardGradesTitle' && (user?.role === 'admin' || user?.role === 'guardian')) {
                return false;
              }
              // Ocultar Comunicaciones del bloque general para guardian (se muestra en guardianCards)
              if (card.titleKey === 'cardCommunicationsStudentTitle' && user?.role === 'guardian') {
                return false;
              }
              if ((card.titleKey === 'cardTestsTitle' || card.titleKey === 'cardSlidesTitle') && user?.role !== 'teacher') {
                return false;
              }
              return true;
            })
            .map((card) => renderFeatureCard(card))}

          {/* Admin specific cards */}
          {user?.role === 'admin' && adminCards.map((card) => (
            <Card 
              key={card.titleKey} 
              className={`flex flex-col text-center shadow-sm hover:shadow-lg transition-shadow duration-300 ${getBorderColorClass(card.colorClass)}`}
            >
              <CardHeader className="items-center relative">
                {card.showBadge && card.titleKey === 'cardPasswordRequestsTitle' && pendingPasswordRequestsCount > 0 && (
                  <Badge 
                    className="absolute -top-2 -right-2 bg-red-500 text-white hover:bg-red-600 text-xs px-2 rounded-full"
                    title={translate('pendingPasswordRequests', { count: String(pendingPasswordRequestsCount) })}
                  >
                    {pendingPasswordRequestsCount > 99 ? '99+' : pendingPasswordRequestsCount}
                  </Badge>
                )}
                <card.icon className={`w-10 h-10 mb-3 ${getIconColorClass(card.colorClass)}`} />
                <CardTitle className="text-lg font-semibold font-headline">{translate(card.titleKey)}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-grow">
                <CardDescription className="text-sm mb-4 flex-grow">
                  {translate(card.descKey)}
                </CardDescription>
                <Button
                  variant="outline"
                  asChild
                  className={cn(
                    "home-card-button",
                    getButtonColorClass(card.colorClass),
                    "hover:shadow-lg transition-shadow duration-200"
                  )}
                >
                  <Link href={card.targetPage}>{translate(card.btnKey)}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Guardian specific cards */}
          {user?.role === 'guardian' && guardianCards.map((card) => (
            <Card 
              key={card.titleKey} 
              className={`flex flex-col text-center shadow-sm hover:shadow-lg transition-shadow duration-300 ${getBorderColorClass(card.colorClass)}`}
            >
              <CardHeader className="items-center relative">
                {/* Badge de comunicaciones no leídas para apoderados - Mismo estilo que estudiante */}
                {card.titleKey === 'cardCommunicationsStudentTitle' && unreadCommunicationsCount > 0 && (
                  <Badge 
                    className="absolute -top-2 -right-2 bg-red-500 text-white hover:bg-red-600 text-xs px-2 rounded-full"
                    title={translate('unreadCommunicationsBadge', { count: String(unreadCommunicationsCount) }) || `${unreadCommunicationsCount} comunicaciones sin leer`}
                  >
                    {unreadCommunicationsCount > 99 ? '99+' : unreadCommunicationsCount}
                  </Badge>
                )}
                <card.icon className={`w-10 h-10 mb-3 ${getIconColorClass(card.colorClass)}`} />
                <CardTitle className="text-lg font-semibold font-headline">{translate(card.titleKey)}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-grow">
                <CardDescription className="text-sm mb-4 flex-grow">
                  {translate(card.descKey)}
                </CardDescription>
                <Button
                  variant="outline"
                  asChild
                  className={cn(
                    "home-card-button",
                    getButtonColorClass(card.colorClass),
                    "hover:shadow-lg transition-shadow duration-200"
                  )}
                >
                  <Link href={card.targetPage}>{translate(card.btnKey)}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Nota: tarjetas específicas de profesor se renderizan solo en el layout de profesor */}
        </div>
      )}
      {/* Monito (misma versión que Calificaciones) */}
      <div className="fixed bottom-24 right-6 z-50">
        <MonitoCalificaciones />
      </div>
    </div>
  );
}

