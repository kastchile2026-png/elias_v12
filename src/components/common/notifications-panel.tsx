"use client";

import React, { useState, useEffect } from 'react';
import { Bell, MessageSquare, Clock, Key, ClipboardCheck, ClipboardList, Lock, Megaphone } from 'lucide-react';
import { ATTENDANCE_COLOR, getHeaderBgClass, getHeaderBorderClass, getTitleTextClass, getIconTextClass, getIconBgClass, getBodyTextClass, getBadgeBgClass, getLinkTextClass } from '@/lib/ui-colors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';
import { TaskNotificationManager } from '@/lib/notifications';
import Link from 'next/link';

// Interfaces
interface TaskComment {
  id: string;
  taskId: string;
  studentId?: string;
  studentUsername: string;
  studentName: string;
  comment: string;
  timestamp: string;
  isSubmission: boolean;
  isNew?: boolean;
  readBy?: string[];
  attachments?: TaskFile[]; // Files attached to this comment/submission
  authorUsername?: string; // Campo adicional para autor real
  authorRole?: string; // Campo adicional para rol del autor
  teacherUsername?: string; // Campo adicional para comentarios de profesores
  grade?: {
    id: string;
    percentage: number;
    feedback?: string;
    gradedBy: string;
    gradedByName: string;
    gradedAt: string;
  };
}

interface TaskFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

interface Task {
  id: string;
  title: string;
  courseSectionId?: string; // opcional para compatibilidad con nuevas secciones
  dueDate: string;
  subject: string;
  course: string;
  assignedBy: string;
  assignedById?: string; // ID del profesor que asignó la tarea
  assignedByName: string;
  taskType: 'assignment' | 'evaluation'; // Tipo de tarea: normal o evaluación
  assignedTo?: 'course' | 'student'; // Tipo de asignación
  assignedStudentIds?: string[]; // IDs de estudiantes específicos cuando assignedTo es 'student'
}

interface PasswordRequest {
  id: string;
  username: string;
  email: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface NotificationsPanelProps {
  count: number;
}

export default function NotificationsPanel({ count: propCount }: NotificationsPanelProps) {
  const { user: authUser } = useAuth();
  const { translate } = useLanguage();
  const [open, setOpen] = useState(false);
  
  // 🚨 FALLBACK: Si el hook useAuth() no funciona, intentar leer directamente del localStorage
  const user = authUser || (() => {
    try {
      const storedUser = localStorage.getItem('smart-student-user');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        console.log('🔧 [NotificationsPanel] Using fallback user from localStorage:', userData);
        return userData;
      }
    } catch (error) {
      console.error('🚨 [NotificationsPanel] Error reading fallback user:', error);
    }
    return null;
  })();
  
  const [unreadComments, setUnreadComments] = useState<(TaskComment & {task?: Task})[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [passwordRequests, setPasswordRequests] = useState<PasswordRequest[]>([]);
  const [studentSubmissions, setStudentSubmissions] = useState<(TaskComment & {task?: Task})[]>([]);
  const [unreadStudentComments, setUnreadStudentComments] = useState<(TaskComment & {task?: Task})[]>([]);
  const [classTasks, setClassTasks] = useState<Task[]>([]);
  const [taskNotifications, setTaskNotifications] = useState<any[]>([]);
  const [pendingGrading, setPendingGrading] = useState<any[]>([]);
  const [count, setCount] = useState(propCount);
  const [isMarking, setIsMarking] = useState(false);
  const [studentCommunications, setStudentCommunications] = useState<any[]>([]);
  // Elementos de asistencia pendiente por curso-sección: { id, label, count }
  const [pendingAttendance, setPendingAttendance] = useState<{ id: string; label: string; count: number }[]>([]);
  const [pendingAttendanceTotal, setPendingAttendanceTotal] = useState<number>(0);

  // ✅ LOG DE DEBUG: Verificar qué count está recibiendo el componente
  console.log(`🔔 [NotificationsPanel] Received count: ${propCount} for user: ${user?.username} (${user?.role})`);
  console.log(`🔔 [NotificationsPanel] Internal count state: ${count}`);

  // Función para dividir texto en dos líneas para badges
  const splitTextForBadge = (text: string, maxLength: number = 8): string[] => {
    if (text.length <= maxLength) return [text];
    
    const words = text.split(' ');
    if (words.length === 1) {
      // Si es una sola palabra muy larga, dividirla por la mitad
      const mid = Math.ceil(text.length / 2);
      return [text.substring(0, mid), text.substring(mid)];
    }
    
    let firstLine = '';
    let secondLine = '';
    let switchToSecond = false;
    
    for (const word of words) {
      if (!switchToSecond && (firstLine + word).length <= maxLength) {
        firstLine += (firstLine ? ' ' : '') + word;
      } else {
        switchToSecond = true;
        secondLine += (secondLine ? ' ' : '') + word;
      }
    }
    
    return firstLine && secondLine ? [firstLine, secondLine] : [text];
  };

  // Función para obtener abreviatura del curso
  const getCourseAbbreviation = (subject: string): string => {
    const abbreviations: { [key: string]: string } = {
      'Matemáticas': 'MAT',
      'Lenguaje': 'LEN', 
      'Historia': 'HIS',
      'Ciencias Naturales': 'CNT',
      'Inglés': 'ING',
      'Educación Física': 'EDF',
      'Artes': 'ART',
      'Música': 'MUS',
      'Tecnología': 'TEC',
      'Filosofía': 'FIL',
      'Química': 'QUI',
      'Física': 'FIS',
      'Biología': 'BIO'
    };
    
    return abbreviations[subject] || subject.substring(0, 3).toUpperCase();
  };

  // Helper: obtener displayName por ID desde localStorage (fallback a rol Profesor)
  const getDisplayNameById = (id?: string): string => {
    try {
      if (!id) return translate('roleTeacher') || 'Profesor';
      const usersRaw = localStorage.getItem('smart-student-users');
      if (!usersRaw) return translate('roleTeacher') || 'Profesor';
      const users = JSON.parse(usersRaw);
      const u = users.find((u: any) => u.id === id);
      return u?.displayName || u?.username || translate('roleTeacher') || 'Profesor';
    } catch {
      return translate('roleTeacher') || 'Profesor';
    }
  };

  // UTIL: Cargar comunicaciones recibidas del estudiante o apoderado (mismo filtro que módulo de comunicaciones)
  const loadStudentCommunications = () => {
    try {
      if (!user || (user.role !== 'student' && user.role !== 'guardian')) { 
        setStudentCommunications([]); 
        return; 
      }
      const commRaw = localStorage.getItem('smart-student-communications');
      if (!commRaw) { setStudentCommunications([]); return; }
      const all: any[] = JSON.parse(commRaw);
      const currentYear = new Date().getFullYear();
      
      // Obtener courses (probar con año primero, luego legacy)
      let courses = JSON.parse(localStorage.getItem(`smart-student-courses-${currentYear}`) || '[]');
      if (courses.length === 0) {
        courses = JSON.parse(localStorage.getItem('smart-student-courses') || '[]');
      }
      
      // Obtener student-assignments (probar con año primero, luego legacy)
      let assignments = JSON.parse(localStorage.getItem(`smart-student-student-assignments-${currentYear}`) || '[]');
      if (assignments.length === 0) {
        assignments = JSON.parse(localStorage.getItem('smart-student-student-assignments') || '[]');
      }

      // Para apoderados: obtener estudiantes asignados
      if (user.role === 'guardian') {
        // ============ BUSCAR ESTUDIANTES ASIGNADOS (igual que perfil-client.tsx) ============
        let assignedStudentIds: string[] = [];
        
        // Prioridad 1: Buscar en smart-student-guardians-{year}
        const guardiansForYear = JSON.parse(localStorage.getItem(`smart-student-guardians-${currentYear}`) || '[]');
        const guardianFromYear = guardiansForYear.find((g: any) => 
          g.username?.toLowerCase() === user.username?.toLowerCase() ||
          g.id === user.id
        );
        
        if (guardianFromYear?.studentIds && guardianFromYear.studentIds.length > 0) {
          assignedStudentIds = guardianFromYear.studentIds;
        }
        
        // Prioridad 2: Buscar en relaciones
        if (assignedStudentIds.length === 0) {
          let guardianRelations = JSON.parse(localStorage.getItem(`smart-student-guardian-student-relations-${currentYear}`) || '[]');
          if (guardianRelations.length === 0) {
            guardianRelations = JSON.parse(localStorage.getItem('smart-student-guardian-student-relations') || '[]');
          }
          assignedStudentIds = guardianRelations
            .filter((rel: any) => rel.guardianId === user.id || rel.guardianUsername === user.username)
            .map((rel: any) => rel.studentId);
        }
        
        // Prioridad 3: Buscar en smart-student-users
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
          setStudentCommunications([]);
          return;
        }

        // Obtener información de estudiantes
        const storedUsers = localStorage.getItem('smart-student-users');
        const allUsers = storedUsers ? JSON.parse(storedUsers) : [];
        const studentsForYear = JSON.parse(localStorage.getItem(`smart-student-students-${currentYear}`) || '[]');
        
        const studentMap = new Map<string, any>();
        
        // Agregar desde studentsForYear
        studentsForYear
          .filter((s: any) => assignedStudentIds.includes(s.id) || assignedStudentIds.includes(s.username))
          .forEach((s: any) => studentMap.set(s.id, s));
        
        // Agregar desde allUsers
        allUsers
          .filter((u: any) => (u.role === 'student' || u.type === 'student') && 
            (assignedStudentIds.includes(u.id) || assignedStudentIds.includes(u.username)))
          .forEach((u: any) => {
            if (!studentMap.has(u.id)) studentMap.set(u.id, u);
          });

        // ============ CONSTRUIR ASIGNACIONES DE ESTUDIANTES ============
        // Primero intentar obtener desde student-assignments
        let studentAssignmentsForGuardian = assignments.filter((a: any) => 
          a && (assignedStudentIds.includes(a.studentId) || Array.from(studentMap.keys()).includes(a.studentId))
        );
        
        // Si no hay asignaciones en student-assignments, buscar en los datos de estudiantes
        if (studentAssignmentsForGuardian.length === 0) {
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

        // 🔧 CORRECCIÓN: Crear instancias separadas por cada estudiante para comunicaciones de curso
        const guardianCommunications: any[] = [];
        all.forEach((comm: any) => {
          // Comunicaciones dirigidas específicamente a alguno de los estudiantes asignados
          if (comm.type === 'student' && comm.targetStudent) {
            const isAssigned = assignedStudentIds.includes(comm.targetStudent) ||
              Array.from(studentMap.values()).some((s: any) => 
                s.username === comm.targetStudent && assignedStudentIds.includes(s.id)
              );
            
            if (isAssigned) {
              const student = studentMap.get(comm.targetStudent) ||
                Array.from(studentMap.values()).find((s: any) => s.username === comm.targetStudent);
              guardianCommunications.push({
                ...comm,
                id: `${comm.id}_${student?.id || comm.targetStudent}`, // ID único por estudiante
                studentInfo: student ? { id: student.id, name: student.displayName || student.name || student.username } : null
              });
            }
            return;
          }
          // Comunicaciones de curso: crear una instancia por cada estudiante que pertenece al curso/sección
          if (comm.type === 'course' && comm.targetCourse) {
            // 🔧 Encontrar TODOS los estudiantes que coinciden, no solo el primero
            const matchingAssignments = studentAssignmentsForGuardian.filter((a: any) => {
              const courseMatch = a.courseId === comm.targetCourse;
              const sectionMatch = !comm.targetSection || a.sectionId === comm.targetSection;
              return courseMatch && sectionMatch;
            });
            
            // Crear una instancia por cada estudiante
            matchingAssignments.forEach((assignment: any) => {
              const student = studentMap.get(assignment.studentId);
              if (student) {
                const course = courses.find((c: any) => c.id === comm.targetCourse);
                guardianCommunications.push({
                  ...comm,
                  id: `${comm.id}_${student.id}`, // ID único por estudiante para evitar duplicados en la UI
                  studentInfo: { 
                    id: student.id, 
                    name: student.displayName || student.name || student.username,
                    courseName: course?.name || comm.targetCourseName,
                    sectionName: comm.targetSectionName
                  }
                });
              }
            });
          }
        });

        // 🔧 Filtrar usando identificador compuesto por estudiante
        const received = guardianCommunications
          .filter((c: any) => {
            const studentId = c.studentInfo?.id;
            const readByKey = studentId ? `${user.id}_forStudent_${studentId}` : user.id;
            return !((c.readBy || []).includes(readByKey)) && !((c.readBy || []).includes(user.id));
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);
        setStudentCommunications(received);
        return;
      }

      // Para estudiantes: lógica existente
      // Fallback por username si no existiera id en algunas asignaciones
      const myAssignments = assignments.filter((a: any) => a && (a.studentId === user.id || a.studentUsername === (user as any).username));
      const active = (user as any).activeCourses as string[] | undefined;
      const studentSectionName = (user as any).sectionName;

      const getCourseName = (id?: string, fb?: string) => {
        if (!id) return fb || '';
        return courses.find((c: any) => c.id === id)?.name || fb || '';
      };

      // Normalizador de IDs curso/sección (soporta targetCourse/targetSection y formatos combinados)
      const extractCourseSection = (comm: any) => {
        let courseId = comm.targetCourse || comm.courseId || '';
        let sectionId = comm.targetSection || comm.sectionId || '';

        const trySplit = (val: string) => {
          if (typeof val !== 'string') return null;
          if (val.includes('::')) { const [c, s] = val.split('::'); if (c && s) return { c, s }; }
          const parts = val.split('-');
          if (parts.length >= 10) { // UUID v4 course + section (5 y 5 bloques)
            const c = parts.slice(0, 5).join('-');
            const s = parts.slice(5, 10).join('-');
            if (c && s) return { c, s };
          }
          return null;
        };

        const fromCourse = trySplit(courseId);
        const fromSection = trySplit(sectionId);
        if (fromCourse && (!sectionId || sectionId === courseId || fromSection)) { courseId = fromCourse.c; sectionId = fromCourse.s; }
        else if (fromSection) { courseId = fromSection.c; sectionId = fromSection.s; }

        return { courseId, sectionId };
      };

      const belongsToStudent = (comm: any): boolean => {
        // Directo al estudiante
        if (comm.type === 'student' && (comm.targetStudent === user.id || comm.targetStudent === (user as any).username)) return true;
        if (comm.type !== 'course') return false;

        const { courseId, sectionId } = extractCourseSection(comm);
        if (!courseId && !sectionId) return false;

        // Asignaciones específicas del estudiante
        if (myAssignments.length > 0) {
          // Coincide curso+sección
          const matchCourseAndSection = sectionId
            ? myAssignments.some((a: any) => a.courseId === courseId && a.sectionId === sectionId)
            : false;
          if (matchCourseAndSection) return true;

          // Solo sección (algunas comunicaciones vienen con sectionId, curso opcional)
          if (sectionId) {
            const matchSectionOnly = myAssignments.some((a: any) => a.sectionId === sectionId);
            if (matchSectionOnly) return true;
          }

          // Solo curso cuando la comunicación no especifica sección
          if (!sectionId && courseId) {
            const matchCourseOnly = myAssignments.some((a: any) => a.courseId === courseId);
            if (matchCourseOnly) return true;
          }

          // Fallback por nombre de sección (legacy)
          if (studentSectionName && comm.targetSectionName && studentSectionName === comm.targetSectionName) return true;
          return false;
        }

        // Sistema legacy: activeCourses del usuario
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

        // Si no hay asignaciones registradas, permitir por defecto (para entornos demo)
        return true;
      };

      const received = all
        .filter(belongsToStudent)
        // Solo no leídas para que desaparezcan al leer
        .filter((c: any) => !((c.readBy || []).includes(user.id)))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5); // limitar a 5 más recientes
      setStudentCommunications(received);
    } catch (e) {
      console.error('[NotificationsPanel] Error cargando comunicaciones de estudiante:', e);
      setStudentCommunications([]);
    }
  };

  // 🔧 NUEVA: Función para validar si una tarea existe
  const validateTaskExists = (taskId: string): boolean => {
    try {
      const storedTasks = localStorage.getItem('smart-student-tasks');
      if (!storedTasks) return false;
      
      const tasks: Task[] = JSON.parse(storedTasks);
      const taskExists = tasks.some(task => task.id === taskId);
      
      if (!taskExists) {
        console.warn(`[NotificationsPanel] Task ${taskId} not found in localStorage`);
      }
      
      return taskExists;
    } catch (error) {
      console.error('Error validating task existence:', error);
      return false;
    }
  };

  // 🎨 NUEVA: Función para obtener el color del enlace según el tipo
  const getLinkColorClass = (linkType: 'evaluation' | 'task' | 'comment' | 'grade'): string => {
    switch (linkType) {
      case 'evaluation':
        return 'text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300';
      case 'task':
        return 'text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300';
      case 'comment':
        return 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300';
      case 'grade':
        return 'text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300';
      default:
        return 'text-primary hover:underline';
    }
  };

  // 🔧 NUEVA: Función para crear enlaces seguros a tareas
  // 🔧 NUEVA FUNCIÓN: Crear enlace específico para Ver Resultados que elimine la notificación
  const createViewResultsLink = (taskId: string, notificationId: string): JSX.Element => {
    const taskExists = validateTaskExists(taskId);
    
    const handleViewResults = () => {
      // Eliminar la notificación específica de evaluación completada
      if (user?.username) {
        console.log(`🔔 [VIEW_RESULTS] Eliminando notificación de evaluación completada: ${notificationId}`);
        TaskNotificationManager.removeEvaluationCompletedNotifications(taskId, user.username, user.id);
        
        // Recargar notificaciones después de eliminar
        setTimeout(() => {
          loadTaskNotifications();
        }, 100);
      }
    };
    
    if (!taskExists) {
      return (
        <button 
          className="inline-block mt-2 text-xs text-gray-400 cursor-not-allowed"
          disabled
          title="Esta tarea ya no existe"
        >
          {translate('viewResultsUnavailable')}
        </button>
      );
    }
    
    const href = `/dashboard/tareas?taskId=${taskId}&highlight=true`;
    
    return (
      <Link 
        href={href}
        onClick={handleViewResults}
        className="inline-block mt-2 text-xs text-purple-600 dark:text-purple-400 hover:underline"
      >
        {translate('viewResultsButton')}
      </Link>
    );
  };

  // 📅 NUEVO: Calcular asistencia pendiente por curso-sección para TODOS los días laborables del año hasta hoy (profesores)
  const computePendingAttendance = () => {
    try {
      if (!user || user.role !== 'teacher') { setPendingAttendance([]); setPendingAttendanceTotal(0); return; }
      const today = new Date();
      const year = today.getFullYear();
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateKey = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
      // Calendario Admin por año
      const loadCfg = (y: number) => {
        const def = { showWeekends: true, summer: {}, winter: {}, holidays: [] as string[] } as any;
        const raw = localStorage.getItem(`admin-calendar-${y}`);
        if (!raw) return def;
        let parsed: any = null; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { /* ignore */ } }
        return { ...def, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
      };
      const parseYmdLocal = (ymd: string) => {
        const [yy, mm, dd] = ymd.split('-').map(Number);
        return new Date(yy, (mm || 1) - 1, dd || 1);
      };
      const inRange = (date: Date, range?: { start?: string; end?: string }) => {
        if (!range?.start || !range?.end) return false;
        const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const a = parseYmdLocal(range.start).getTime();
        const b = parseYmdLocal(range.end).getTime();
        const [min, max] = a <= b ? [a, b] : [b, a];
        return t >= min && t <= max;
      };
      const cfg = loadCfg(year);
      const isWorkingDay = (d: Date) => {
        const key = dateKey(d);
        const isHoliday = Array.isArray(cfg.holidays) && cfg.holidays.includes(key);
        const isSummer = inRange(d, cfg.summer);
        const isWinter = inRange(d, cfg.winter);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const weekendBlocked = cfg.showWeekends ? isWeekend : false; // mantener semántica existente
        return !(weekendBlocked || isHoliday || isSummer || isWinter);
      };

      const teacherAssignments = JSON.parse(localStorage.getItem('smart-student-teacher-assignments') || '[]');
      const sections = JSON.parse(localStorage.getItem('smart-student-sections') || '[]');
      const courses = JSON.parse(localStorage.getItem('smart-student-courses') || '[]');
      const studentAssignments = JSON.parse(localStorage.getItem('smart-student-student-assignments') || '[]');
      const csLabels: Record<string, string> = {};

      const parseComposite = (val?: string) => {
        if (!val || typeof val !== 'string') return null as null | { c: string; s: string };
        if (val.includes('::')) {
          const [c, s] = val.split('::');
          if (c && s) return { c, s };
        }
        const parts = val.split('-');
        if (parts.length >= 10) {
          const c = parts.slice(0, 5).join('-');
          const s = parts.slice(5, 10).join('-');
          if (c && s) return { c, s };
        }
        return null;
      };

      const getLabel = (courseId: string, sectionId: string, fbCourseName?: string, fbSectionName?: string) => {
        const csId = `${courseId}-${sectionId}`;
        if (csLabels[csId]) return csLabels[csId];
        const c = courses.find((x: any) => x.id === courseId);
        const s = sections.find((x: any) => x.id === sectionId || x.sectionId === sectionId);
        const label = `${(c?.name || fbCourseName || '').trim() || 'Curso'} ${(s?.name || fbSectionName || '').trim()}`.trim();
        csLabels[csId] = label;
        return label;
      };

      const myAssignments = teacherAssignments.filter((ta: any) =>
        ta.teacherId === user.id || ta.teacherUsername === user.username || ta.teacher === user.username
      );

  const uniqueCS: Array<{ id: string; label: string; courseId: string; sectionId: string }> = [];
      const seen = new Set<string>();
      myAssignments.forEach((ta: any) => {
        let sectionId = ta.sectionId || ta.section || ta.sectionUUID || ta.section_id || ta.sectionID;
        let courseId = ta.courseId || ta.course || ta.courseUUID || ta.course_id || ta.courseID;

        if ((!courseId || !sectionId) && ta.courseSectionId) {
          const parsed = parseComposite(String(ta.courseSectionId));
          if (parsed) { courseId = courseId || parsed.c; sectionId = sectionId || parsed.s; }
        }

        if (!courseId && sectionId) {
          const sec = sections.find((s: any) => s && (s.id === sectionId || s.sectionId === sectionId || s.uuid === sectionId));
          courseId = sec?.courseId || (sec?.course && (sec.course.id || sec.courseId));
        }

        if (!sectionId && ta.sectionName) {
          const sec = sections.find((s: any) => (s?.name === ta.sectionName) && (s?.courseId === courseId || s?.course?.id === courseId));
          if (sec) sectionId = sec.id || sec.sectionId;
        }

        if (courseId && sectionId) {
          const id = `${courseId}-${sectionId}`;
          if (!seen.has(id)) {
            seen.add(id);
            const label = getLabel(courseId, sectionId, ta.courseName, ta.sectionName);
            uniqueCS.push({ id, label, courseId, sectionId });
          }
        }
      });

      const attendance = JSON.parse(localStorage.getItem('smart-student-attendance') || '[]');
      // Indexar asistencia por curso y fecha -> Set de estudiantes
      const attendanceIndex: Record<string, Record<string, Set<string>>> = {};
      (attendance || []).forEach((r: any) => {
        if (!r || !r.course || !r.date || !r.studentUsername) return;
        attendanceIndex[r.course] = attendanceIndex[r.course] || {};
        attendanceIndex[r.course][r.date] = attendanceIndex[r.course][r.date] || new Set<string>();
        attendanceIndex[r.course][r.date].add(r.studentUsername);
      });

      // Construir lista de días laborables desde el 1 de enero hasta hoy (inclusive)
      const start = new Date(year, 0, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const workingDays: string[] = [];
      for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
        const local = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        if (isWorkingDay(local)) workingDays.push(dateKey(local));
      }

      // Calcular pendientes por curso-sección
      const pendingMap: Record<string, number> = {};
      uniqueCS.forEach(({ id, sectionId }) => {
        // estudiantes asignados a la sección
        const assigned = (studentAssignments || []).filter((sa: any) => sa.sectionId === sectionId);
        const assignedCount = assigned.length;
        if (assignedCount === 0) return; // sin estudiantes, no contar

        const courseAttendance = attendanceIndex[id] || {};
        let pending = 0;
        for (const day of workingDays) {
          const set = courseAttendance[day] || new Set<string>();
          if (set.size < assignedCount) pending++;
        }
        if (pending > 0) pendingMap[id] = pending;
      });

      const pendingList: { id: string; label: string; count: number }[] = [];
      for (const item of uniqueCS) {
        const count = pendingMap[item.id] || 0;
        if (count > 0) pendingList.push({ id: item.id, label: item.label, count });
      }

      // Ordenar por mayor pendiente
      pendingList.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      setPendingAttendance(pendingList);
      setPendingAttendanceTotal(pendingList.reduce((sum, it) => sum + it.count, 0));
      try {
        localStorage.setItem('smart-student-attendance-pending-detail', JSON.stringify(pendingList));
        localStorage.setItem('smart-student-attendance-pending-total', String(pendingList.reduce((sum, it) => sum + it.count, 0)));
        // Notificar a dashboard/campana
        window.dispatchEvent(new CustomEvent('notificationsUpdated', { detail: { source: 'attendance', action: 'recompute' } }));
        window.dispatchEvent(new CustomEvent('updateDashboardCounts', { detail: { source: 'attendance', action: 'recompute' } }));
      } catch {}
    } catch (e) {
      console.error('[NotificationsPanel] Error calculando asistencia pendiente:', e);
      setPendingAttendance([]);
      setPendingAttendanceTotal(0);
      try {
        localStorage.setItem('smart-student-attendance-pending-detail', JSON.stringify([]));
        localStorage.setItem('smart-student-attendance-pending-total', '0');
        window.dispatchEvent(new CustomEvent('notificationsUpdated', { detail: { source: 'attendance', action: 'error' } }));
      } catch {}
    }
  };

  useEffect(() => { computePendingAttendance(); }, [user]);

  const createSafeTaskLink = (taskId: string, additionalParams: string = '', linkText?: string, linkType: 'evaluation' | 'task' = 'task'): JSX.Element => {
    const taskExists = validateTaskExists(taskId);
    
    // Determinar el texto del enlace usando traducciones
    const defaultLinkText = linkType === 'evaluation' ? translate('viewEvaluationButton') : translate('viewTaskButton');
    const finalLinkText = linkText || defaultLinkText;
    
    if (!taskExists) {
      const unavailableText = linkType === 'evaluation' 
        ? translate('viewResultsUnavailable') 
        : translate('viewTaskUnavailable');
      
      return (
        <button 
          className="inline-block mt-2 text-xs text-gray-400 cursor-not-allowed"
          disabled
          title={translate('taskNoLongerExists') || 'Esta tarea ya no existe'}
        >
          {unavailableText}
        </button>
      );
    }
    
    const href = `/dashboard/tareas?taskId=${taskId}${additionalParams}&highlight=true`;
    const colorClass = getLinkColorClass(linkType);
    
    return (
      <Link 
        href={href}
        className={`inline-block mt-2 text-xs ${colorClass} hover:underline`}
      >
        {finalLinkText}
      </Link>
    );
  };

  // ✅ CORREGIDA Y MEJORADA: Función para verificar si CUALQUIER tarea está finalizada
  const isTaskAlreadyGraded = (taskId: string, studentUsername: string): boolean => {
    try {
      console.log(`🔍 [isTaskAlreadyGraded] Verificando si tarea ${taskId} de estudiante ${studentUsername} está finalizada...`);

      // 1. PRIMERA VERIFICACIÓN: ¿Es una evaluación con resultado guardado?
      const storedResults = localStorage.getItem('smart-student-evaluation-results');
      if (storedResults) {
        const results = JSON.parse(storedResults);
        const evaluationResult = results.find((result: any) => 
          result.taskId === taskId && result.studentUsername === studentUsername
        );
        if (evaluationResult) {
          console.log(`[isTaskAlreadyGraded] ✅ Encontrado resultado de EVALUACIÓN para ${studentUsername}. Tarea finalizada.`);
          return true;
        }
      }

      // 2. SEGUNDA VERIFICACIÓN: ¿Es una tarea normal con calificación (grade)?
      const commentsData = localStorage.getItem('smart-student-task-comments');
      if (commentsData) {
        const comments = JSON.parse(commentsData);
        
        const studentSubmission = comments.find((comment: any) => 
          comment.taskId === taskId && 
          comment.studentUsername === studentUsername && 
          comment.isSubmission === true
        );
        
        if (studentSubmission) {
          const isGraded = studentSubmission.grade !== undefined && studentSubmission.grade !== null;
          if (isGraded) {
            console.log(`[isTaskAlreadyGraded] ✅ Encontrada CALIFICACIÓN para ${studentUsername}. Tarea finalizada.`);
            return true;
          }
        }
      }
      
      console.log(`[isTaskAlreadyGraded] ❌ No se encontró resultado ni calificación para ${studentUsername}. Tarea pendiente.`);
      return false;
      
    } catch (error) {
      console.error('❌ [isTaskAlreadyGraded] Error verificando si la tarea está calificada:', error);
      return false;
    }
  };

  // 🔧 NUEVA: Función para crear enlaces seguros a comentarios
  const createSafeCommentLink = (taskId: string, commentId: string, linkText: string = 'Ver comentario'): JSX.Element => {
    const taskExists = validateTaskExists(taskId);
    
    if (!taskExists) {
      return (
        <button 
          className="inline-block mt-2 text-xs text-gray-400 cursor-not-allowed"
          disabled
          title="La tarea asociada a este comentario ya no existe"
        >
          {linkText} (No disponible)
        </button>
      );
    }
    
    const href = `/dashboard/tareas?taskId=${taskId}&commentId=${commentId}&highlight=true`;
    const colorClass = getLinkColorClass('comment');
    
    // 🔥 NUEVA MEJORA: Función para manejar el clic en "Ver Comentario"
    const handleCommentClick = (e: React.MouseEvent) => {
      console.log('🔔 [NotificationsPanel] Comment link clicked:', { taskId, commentId });
      
      // Marcar el comentario específico como leído antes de navegar
      if (user?.role === 'student') {
        const storedComments = localStorage.getItem('smart-student-task-comments');
        if (storedComments) {
          const comments = JSON.parse(storedComments);
          let hasUpdates = false;
          
          const updatedComments = comments.map((comment: any) => {
            if (comment.id === commentId && !comment.readBy?.includes(user.username)) {
              hasUpdates = true;
              console.log(`🔔 [NotificationsPanel] Marking comment as read: ${comment.comment}`);
              return {
                ...comment,
                isNew: false,
                readBy: [...(comment.readBy || []), user.username]
              };
            }
            return comment;
          });
          
          if (hasUpdates) {
            localStorage.setItem('smart-student-task-comments', JSON.stringify(updatedComments));
            
            // ✅ NUEVA MEJORA: Disparar eventos específicos para actualizar dashboard (IGUAL QUE PROFESOR)
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('updateDashboardCounts', {
                detail: { userRole: user.role, action: 'single_comment_read' }
              }));
            }, 100);
            
            // Disparar evento para actualizar el dashboard
            window.dispatchEvent(new CustomEvent('studentCommentsUpdated', { 
              detail: { 
                username: user.username,
                taskId: taskId,
                commentId: commentId,
                action: 'single_comment_viewed'
              } 
            }));
            
            // Disparar eventos adicionales
            document.dispatchEvent(new Event('commentsUpdated'));
            
            console.log('🔔 [NotificationsPanel] Comment marked as read and dashboard events dispatched');
          }
        }
      }
    };
    
    return (
      <Link 
        href={href}
        className={`inline-block mt-2 text-xs ${colorClass} hover:underline`}
        onClick={handleCommentClick}
      >
        {linkText}
      </Link>
    );
  };

  // Use the count provided by the parent component instead of calculating our own
  useEffect(() => {
    setCount(propCount);
  }, [propCount]);

  // ✅ NUEVO: Listener para sincronización del conteo
  useEffect(() => {
    const handleCountUpdate = (event: CustomEvent) => {
      if (event.detail?.type === 'teacher_counters_updated') {
        console.log(`[NotificationsPanel] Count update event received:`, event.detail);
        // El conteo se actualiza desde el componente padre (dashboard)
        // Solo necesitamos recargar los datos para mantener sincronización
        if (user?.role === 'teacher') {
          setTimeout(() => {
            loadStudentSubmissions();
            loadTaskNotifications();
            loadPendingGrading();
          }, 100);
        }
      }
    };

    // ✅ NUEVO: Listener para actualizaciones generales de notificaciones
    const handleGeneralNotificationUpdate = (event: CustomEvent) => {
      console.log(`[NotificationsPanel] General notification update:`, event.detail);
      
      // Recargar datos según el rol del usuario
      if (user?.role === 'teacher') {
        loadStudentSubmissions();
        loadTaskNotifications();
        loadPendingGrading();
        
        // Disparar evento para actualizar el conteo del dashboard
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('updateDashboardCounts', {
            detail: { userRole: user.role }
          }));
        }, 200);
      } else if (user?.role === 'student') {
        loadUnreadComments();
        loadPendingTasks();
        loadTaskNotifications();
        
        // Disparar evento para actualizar el conteo del dashboard
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('updateDashboardCounts', {
            detail: { userRole: user.role }
          }));
        }, 200);
      } else if (user?.role === 'guardian') {
        loadStudentCommunications();
        
        // Disparar evento para actualizar el conteo del dashboard
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('updateDashboardCounts', {
            detail: { userRole: user.role }
          }));
        }, 200);
      }
    };

    window.addEventListener('notificationsUpdated', handleCountUpdate as EventListener);
    window.addEventListener('commentsUpdated', handleGeneralNotificationUpdate as EventListener);
    window.addEventListener('taskNotificationsUpdated', handleGeneralNotificationUpdate as EventListener);
    
    return () => {
      window.removeEventListener('notificationsUpdated', handleCountUpdate as EventListener);
      window.removeEventListener('commentsUpdated', handleGeneralNotificationUpdate as EventListener);
      window.removeEventListener('taskNotificationsUpdated', handleGeneralNotificationUpdate as EventListener);
    };
  }, [user]);

  useEffect(() => {
    // 🔄 NUEVA CARGA INICIAL OPTIMIZADA: Evitar panel vacío inicial
    if (user) {
      console.log(`[NotificationsPanel] 🚀 OPTIMIZED INITIAL LOAD for user: ${user.username}, role: ${user.role}`);
      
      // 🔧 MIGRACIÓN: Actualizar notificaciones que muestran "Sistema"
      TaskNotificationManager.migrateSystemNotifications();
      
      // 🧹 NUEVO: Ejecutar limpieza automática al cargar
      TaskNotificationManager.cleanupFinalizedTaskNotifications();
      
      // 🔄 MEJORADO: Función de carga sincronizada para evitar "panel vacío inicial"
      const loadDataSynchronized = async () => {
        console.log(`[NotificationsPanel] 🔄 Starting synchronized data load for ${user.username} (${user.role})`);
        
  // Clear all states first to avoid residual data when switching users/roles
        setUnreadComments([]);
        setPendingTasks([]);
        setPasswordRequests([]);
        setStudentSubmissions([]);
        setUnreadStudentComments([]);
        setClassTasks([]);
        setTaskNotifications([]);
        setPendingGrading([]);
  setStudentCommunications([]);
        
        try {
          if (user.role === 'admin') {
            console.log(`[NotificationsPanel] 👑 Loading admin data...`);
            loadPasswordRequests();
          } else if (user.role === 'student') {
            console.log(`[NotificationsPanel] 🎓 Loading student data synchronously...`);
            
            // 🔄 NUEVO: Carga sincronizada para estudiantes - evitar delays
            // Cargar todo en secuencia sin timeouts para evitar panel vacío
            loadUnreadComments();
            loadTaskNotifications(); // Primero las notificaciones (más rápido)
            loadPendingTasks(); // Luego las tareas (puede tardar más por filtrado)
            loadStudentCommunications(); // Y comunicaciones recibidas
            
            console.log(`[NotificationsPanel] ✅ Student data loaded synchronously`);
          } else if (user.role === 'teacher') {
            console.log(`[NotificationsPanel] 👨‍🏫 Loading teacher data synchronously...`);
            
            // 🔄 NUEVO: Carga sincronizada para profesores
            loadTaskNotifications(); // Primero las notificaciones
            loadStudentSubmissions(); // Luego las entregas
            loadPendingGrading(); // Finalmente las calificaciones pendientes
            
            // Clear pending tasks for teachers as they don't have pending tasks, only submissions to review
            setPendingTasks([]);
            
            console.log(`[NotificationsPanel] ✅ Teacher data loaded synchronously`);
          } else if (user.role === 'guardian') {
            // 🔧 NUEVO: Carga sincronizada para apoderados
            console.log(`[NotificationsPanel] 👪 Loading guardian data synchronously...`);
            
            // Los apoderados solo ven comunicaciones de sus estudiantes
            loadStudentCommunications();
            
            console.log(`[NotificationsPanel] ✅ Guardian data loaded synchronously`);
          }
        } catch (error) {
          console.error(`[NotificationsPanel] ❌ Error during synchronized load:`, error);
        }
      };
      
      // 🚀 EJECUTAR CARGA INMEDIATA SIN DELAY
      loadDataSynchronized();
    }
    
    // 🔄 MEJORADO: Event listeners optimizados para evitar recargas innecesarias
    const handleNotificationSync = () => {
      if (user) {
        console.log('[NotificationsPanel] 📡 Essential notification sync triggered, reloading minimal data...');
        
        // 🔄 OPTIMIZADO: Solo recargar datos esenciales sin redundancia
        if (user.role === 'teacher') {
          loadTaskNotifications(); // Solo notificaciones, las demás se actualizan por otros eventos
        } else if (user.role === 'student') {
          // 🔄 NUEVO: Para estudiantes, solo recargar si hay cambios específicos
          loadTaskNotifications();
          
          // 🔄 OPTIMIZADO: Recargar tareas pendientes con pequeño delay para evitar múltiples cargas
          setTimeout(() => {
            loadPendingTasks();
          }, 300);
        }
      }
    };
    
    // 🔄 SIMPLIFICADO: Solo los event listeners esenciales
    window.addEventListener('taskGraded', handleNotificationSync);
    window.addEventListener('taskNotificationsUpdated', handleNotificationSync);
    
    return () => {
      window.removeEventListener('taskGraded', handleNotificationSync);
      window.removeEventListener('taskNotificationsUpdated', handleNotificationSync);
    };
  }, [user]);

  useEffect(() => {
    // Listener for storage events to update in real-time
    const handleStorageChange = (e: StorageEvent) => {
      // 🧹 NUEVO: Ejecutar limpieza automática en cambios de storage para profesores
      if (user?.role === 'teacher' && (
        e.key === 'smart-student-task-notifications' ||
        e.key === 'smart-student-tasks' ||
        e.key === 'smart-student-task-comments'
      )) {
        console.log('🧹 [STORAGE_CHANGE] Ejecutando limpieza automática...');
        TaskNotificationManager.cleanupFinalizedTaskNotifications();
      }
      
      if (e.key === 'password-reset-requests') {
        if (user?.role === 'admin') {
          loadPasswordRequests();
        }
      }
      if (e.key === 'smart-student-task-comments') {
        if (user?.role === 'student') {
          loadUnreadComments();
        } else if (user?.role === 'teacher') {
          loadStudentSubmissions();
        }
      }
      if (e.key === 'smart-student-tasks') {
        if (user?.role === 'student') {
          loadPendingTasks();
        } else if (user?.role === 'teacher') {
          loadStudentSubmissions();
        }
      }
      if (e.key === 'smart-student-communications') {
        if (user?.role === 'student' || user?.role === 'guardian') {
          loadStudentCommunications();
        }
      }
      // Recalcular asistencia si cambian asignaciones, secciones, cursos o registros de asistencia
      if (
        e.key === 'smart-student-attendance' ||
        e.key === 'smart-student-teacher-assignments' ||
        e.key === 'smart-student-sections' ||
        e.key === 'smart-student-courses'
      ) {
        computePendingAttendance();
      }
      // Recalcular si cambia calendario admin
      if (e.key && e.key.startsWith('admin-calendar-')) {
        computePendingAttendance();
      }
    };
    
    // Setup listeners for both the storage event and custom events
    window.addEventListener('storage', handleStorageChange);

    // Create a named function for the event listener so it can be properly removed
    const handleCommentsUpdated = () => {
      if (user?.role === 'student') {
        loadUnreadComments();
      } else if (user?.role === 'teacher') {
        loadStudentSubmissions();
      }
    };

    // Custom event listener for when a comment is marked as read by a component
    document.addEventListener('commentsUpdated', handleCommentsUpdated);

    // Custom event listener for task notifications
    const handleTaskNotificationsUpdated = () => {
      // 🔧 MEJORA: Ejecutar migración antes de recargar
      TaskNotificationManager.migrateSystemNotifications();
      
      // 🧹 NUEVO: Ejecutar limpieza automática
      TaskNotificationManager.cleanupFinalizedTaskNotifications();
      
      loadTaskNotifications();
      
      // 🔥 NUEVO: También actualizar tareas pendientes cuando se actualicen las notificaciones
      loadPendingTasks();
      console.log('🎯 [handleTaskNotificationsUpdated] Updated both task notifications and pending tasks');
    };
    window.addEventListener('taskNotificationsUpdated', handleTaskNotificationsUpdated);
    
    // 🔥 NUEVO: Listener específico para actualizar tareas pendientes
    const handlePendingTasksUpdated = () => {
      console.log('🎯 [handlePendingTasksUpdated] Event received, reloading pending tasks');
      loadPendingTasks();
    };
    window.addEventListener('pendingTasksUpdated', handlePendingTasksUpdated);
    
    // 🔥 NUEVO: Listener para actualizar notificaciones cuando se califique una tarea
    const handleGradingUpdated = () => {
      console.log('🎯 [handleGradingUpdated] Task graded, reloading notifications and pending tasks');
      loadTaskNotifications();
      loadPendingTasks(); // 🔥 AGREGAR: También actualizar tareas pendientes
    };
    window.addEventListener('taskGraded', handleGradingUpdated);
    
    // 🚀 NUEVO: Listener específico para cuando un estudiante completa una evaluación
    const handleEvaluationCompleted = (event: CustomEvent) => {
      console.log('🎯 [handleEvaluationCompleted] Evaluation completed event received:', event.detail);
      console.log('🔄 [handleEvaluationCompleted] Reloading all notification components...');
      
      // Forzar recarga de todos los componentes de notificación
      setTimeout(() => {
        loadUnreadComments();
        loadPendingTasks();
  loadStudentCommunications();
        loadTaskNotifications();
        console.log('✅ [handleEvaluationCompleted] All notification components reloaded');
      }, 100); // Pequeño delay para asegurar que el localStorage se actualice primero
    };
    window.addEventListener('evaluationCompleted', handleEvaluationCompleted as EventListener);
    
    // 🔔 NUEVO: Escuchar actualizaciones de comunicaciones de estudiantes
    const handleStudentCommunicationsUpdated = (event: CustomEvent) => {
      console.log('🎯 [handleStudentCommunicationsUpdated] Event received in notifications panel:', event.detail);
      if (user?.role === 'student') {
        console.log('🔄 [handleStudentCommunicationsUpdated] Reloading student communications in panel');
        loadStudentCommunications();
      }
    };
    window.addEventListener('studentCommunicationsUpdated', handleStudentCommunicationsUpdated as EventListener);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('commentsUpdated', handleCommentsUpdated);
      window.removeEventListener('taskNotificationsUpdated', handleTaskNotificationsUpdated);
      window.removeEventListener('pendingTasksUpdated', handlePendingTasksUpdated);
      window.removeEventListener('taskGraded', handleGradingUpdated);
      window.removeEventListener('evaluationCompleted', handleEvaluationCompleted as EventListener);
  window.removeEventListener('studentCommunicationsUpdated', handleStudentCommunicationsUpdated as EventListener);
    };
  }, [user, open]); // Reload data when the panel is opened or user changes

  // 🎯 Función para verificar si un estudiante está asignado a una tarea específica
  const checkStudentAssignmentToTask = (task: any, studentId: string, studentUsername: string): boolean => {
    console.log(`🔍 [checkStudentAssignmentToTask] Verificando acceso para estudiante ${studentUsername} (ID: ${studentId}) a tarea "${task.title}"`);
    console.log(`📋 [checkStudentAssignmentToTask] Tarea asignada a: ${task.assignedTo}, curso: ${task.course || task.courseSectionId}`);
    
    // Si la tarea está asignada a estudiantes específicos
    if (task.assignedTo === 'student' && task.assignedStudentIds) {
      const isDirectlyAssigned = task.assignedStudentIds.includes(studentId);
      console.log(`🎯 [checkStudentAssignmentToTask] Estudiante ${studentUsername} directamente asignado: ${isDirectlyAssigned ? '✅' : '❌'}`);
      return isDirectlyAssigned;
    }
    
    // Si la tarea está asignada a todo el curso
    if (task.assignedTo === 'course') {
      const taskCourseId = task.courseSectionId || task.course;
      
      if (!taskCourseId) {
        console.log(`⚠️ [checkStudentAssignmentToTask] Tarea sin courseId definido`);
        return false;
      }
      
      // Obtener datos del localStorage
      const users = JSON.parse(localStorage.getItem('smart-student-users') || '[]');
      const studentData = users.find((u: any) => u.id === studentId || u.username === studentUsername);
      
      if (!studentData) {
        console.log(`❌ [checkStudentAssignmentToTask] Datos del estudiante no encontrados: ${studentUsername}`);
        return false;
      }
      
      // 🎯 VERIFICAR ASIGNACIONES ESPECÍFICAS (copiado de page.tsx que funciona)
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
      
      // Fallback: verificar por activeCourses (sistema legacy)
      const isInActiveCourses = studentData.activeCourses?.some((course: any) => 
        course.courseId === taskCourseId.split('-')[0] && 
        course.sectionId === taskCourseId.split('-')[1]
      ) || studentData.activeCourses?.includes(taskCourseId) || false;
      
      console.log(`🔄 [checkStudentAssignmentToTask] Fallback activeCourses para ${studentUsername}: ${isInActiveCourses ? '✅' : '❌'}`);
      
      return isInActiveCourses;
    }
    
    // Compatibilidad con versiones anteriores
    if (task.assignedStudents && task.assignedStudents.includes(studentUsername)) {
      console.log(`🔄 [checkStudentAssignmentToTask] Fallback assignedStudents para ${studentUsername}: ✅`);
      return true;
    }
    
    console.log(`❌ [checkStudentAssignmentToTask] Estudiante ${studentUsername} no tiene acceso a la tarea "${task.title}"`);
    return false;
  };

  // 🎯 Función helper para obtener cursos disponibles en el contexto de notificaciones
  const getAvailableCoursesForNotifications = () => {
    try {
      // Intentar obtener asignaciones específicas del sistema de asignaciones
      const teacherAssignments = JSON.parse(localStorage.getItem('smart-student-teacher-assignments') || '[]');
      const courses = JSON.parse(localStorage.getItem('smart-student-courses') || '[]');
      const sections = JSON.parse(localStorage.getItem('smart-student-sections') || '[]');
      
      // Buscar asignaciones del profesor actual
      if (user?.role === 'teacher') {
        const userAssignments = teacherAssignments.filter((assignment: any) => 
          assignment.teacherId === user.id
        );

        if (userAssignments.length > 0) {
          // Crear lista de cursos y secciones únicos del profesor
          const courseSectionsMap = new Map();
          
          userAssignments.forEach((assignment: any) => {
            const section = sections.find((s: any) => s.id === assignment.sectionId);
            if (section) {
              const course = courses.find((c: any) => c.id === section.courseId);
              if (course) {
                const key = `${course.id}-${section.id}`;
                if (!courseSectionsMap.has(key)) {
                  courseSectionsMap.set(key, {
                    id: key,
                    courseId: course.id,
                    sectionId: section.id,
                    name: `${course.name} Sección ${section.name}`,
                    originalCourseName: course.name,
                    sectionName: section.name
                  });
                }
              }
            }
          });

          if (courseSectionsMap.size > 0) {
            return Array.from(courseSectionsMap.values());
          }
        }
      }
      
      // Fallback para estudiantes o cuando no hay asignaciones específicas
      const courseIds = user?.activeCourses || [];
      return courseIds.map((courseId: string) => ({
        id: courseId,
        courseId: courseId,
        sectionId: null,
        name: courseId,
        originalCourseName: courseId,
        sectionName: ''
      }));
    } catch (error) {
      console.error('Error getting available courses for notifications:', error);
      return [];
    }
  };

  const loadUnreadComments = () => {
    try {
      // Load comments
      const storedComments = localStorage.getItem('smart-student-task-comments');
      const storedTasks = localStorage.getItem('smart-student-tasks');
      
      if (storedComments && storedTasks) {
        const comments: TaskComment[] = JSON.parse(storedComments);
        const tasks: Task[] = JSON.parse(storedTasks);
        
        console.log(`[loadUnreadComments] Processing ${comments.length} comments for student ${user?.username}`);
        
        // 🔧 FILTRADO DIRECTO PARA ESTUDIANTES: Solo mostrar comentarios de tareas asignadas
        const unread = comments.filter(comment => {
          // No mostrar comentarios propios (verificar tanto studentUsername como authorUsername)
          if (comment.studentUsername === user?.username || comment.authorUsername === user?.username) {
            console.log(`🚫 [loadUnreadComments] Comentario propio de ${user?.username} - Filtrando`);
            return false;
          }
          
          // No mostrar entregas de otros estudiantes
          if (comment.isSubmission) {
            console.log(`🚫 [loadUnreadComments] Entrega de otro estudiante - Filtrando`);
            return false;
          }
          
          // Verificar si ya fue leído
          if (comment.readBy?.includes(user?.username || '')) {
            console.log(`🚫 [loadUnreadComments] Comentario ya leído por ${user?.username} - Filtrando`);
            return false;
          }
          
          // 🎯 FILTRO CRÍTICO: Verificar asignación específica para estudiantes
          const task = tasks.find(t => t.id === comment.taskId);
          if (!task) {
            console.log(`🚫 [loadUnreadComments] Tarea no encontrada para comentario: ${comment.taskId}`);
            return false;
          }
          
          console.log(`🔍 [loadUnreadComments] Procesando comentario en tarea "${task.title}" (assignedTo: ${task.assignedTo})`);
          console.log(`📝 [loadUnreadComments] Comentario por: ${comment.authorUsername || comment.studentUsername} (${comment.authorRole || 'student'})`);
          
          // Si es una tarea asignada a estudiantes específicos
          if (task.assignedTo === 'student' && task.assignedStudentIds) {
            const users = JSON.parse(localStorage.getItem('smart-student-users') || '[]');
            const currentUser = users.find((u: any) => u.username === user?.username);
            
            if (!currentUser || !task.assignedStudentIds.includes(currentUser.id)) {
              console.log(`🚫 [loadUnreadComments] Estudiante ${user?.username} NO asignado a tarea específica "${task.title}" - Filtrando comentario`);
              return false;
            }
            
            console.log(`✅ [loadUnreadComments] Estudiante ${user?.username} SÍ asignado a tarea específica "${task.title}" - Mostrando comentario`);
            return true;
          }
          
          // Para tareas de curso completo, usar el filtro existente
          const isAssignedToTask = checkStudentAssignmentToTask(task, user?.id || '', user?.username || '');
          
          if (!isAssignedToTask) {
            console.log(`🚫 [loadUnreadComments] Estudiante ${user?.username} NO asignado a tarea de curso "${task.title}" - Ocultando comentario`);
            return false;
          }
          
          console.log(`✅ [loadUnreadComments] Estudiante ${user?.username} SÍ asignado a tarea de curso "${task.title}" - Mostrando comentario`);
          return true;
        }).map(comment => {
          // Find associated task for each comment for display
          const task = tasks.find(t => t.id === comment.taskId);
          return { ...comment, task };
        });
        
        console.log(`[loadUnreadComments] Found ${unread.length} unread comments for student ${user?.username} (after privacy filter)`);
        setUnreadComments(unread);
      }
    } catch (error) {
      console.error('Error loading unread comments:', error);
    }
  };

  const loadPendingTasks = () => {
    try {
      // 🚨 SAFETY CHECK: Verificar que user existe
      if (!user || !user.username) {
        console.error('🚨 [loadPendingTasks] User not properly defined:', user);
        setPendingTasks([]);
        return;
      }
      
      const storedTasks = localStorage.getItem('smart-student-tasks');
      const storedComments = localStorage.getItem('smart-student-task-comments');
      
      if (storedTasks) {
        const tasks: Task[] = JSON.parse(storedTasks);
        const comments: TaskComment[] = storedComments ? JSON.parse(storedComments) : [];
        
        console.log(`[loadPendingTasks] 🔍 Processing ${tasks.length} total tasks for ${user.username}`);
        
        // Filter tasks assigned to the student with due dates approaching
        const now = new Date();
        const studentTasks = tasks.filter(task => {
          // 🎯 FILTRO CRÍTICO: Verificar asignación específica para estudiantes PRIMERO
          let isAssigned = false;
          
          if (task.assignedTo === 'student' && task.assignedStudentIds) {
            // Es una tarea asignada a estudiantes específicos
            const users = JSON.parse(localStorage.getItem('smart-student-users') || '[]');
            const currentUser = users.find((u: any) => u.username === user?.username);
            
            if (!currentUser || !task.assignedStudentIds.includes(currentUser.id)) {
              console.log(`🚫 [loadPendingTasks] Filtrando tarea específica "${task.title}" para ${user?.username} - No asignado`);
              return false; // El estudiante NO está asignado a esta tarea específica
            }
            
            console.log(`✅ [loadPendingTasks] Tarea específica "${task.title}" válida para ${user?.username} - Sí asignado`);
            isAssigned = true;
          } else {
            // Para tareas de curso completo, verificar curso
            isAssigned = (
              task.course && user?.activeCourses?.includes(task.course)
            );
          }
          
          const dueDate = new Date(task.dueDate);
          const isApproaching = dueDate > now; // Only include not overdue tasks
          
          // 🔥 MEJORADO: Lógica unificada para todas las tareas
          // Detectar evaluaciones de múltiples formas
          const isEvaluation = task.taskType === 'evaluation' || 
                              task.title.toLowerCase().includes('eval') ||
                              task.title.toLowerCase().includes('evaluación') ||
                              task.title.toLowerCase().includes('examen');
          
          // ✅ CLAVE: Verificar si la tarea ya fue calificada (aplica a TODAS las tareas)
          const isGraded = isTaskAlreadyGraded(task.id, user?.username || '');
          
          if (isEvaluation) {
            console.log(`[loadPendingTasks] 🔍 Detected evaluation "${task.title}" (ID: ${task.id}, taskType: ${task.taskType}) for ${user?.username}`);
            
            // Verificar si la evaluación fue completada a través de notificaciones
            let isCompletedByNotification = false;
            try {
              if (TaskNotificationManager && TaskNotificationManager.isEvaluationCompletedByStudent) {
                isCompletedByNotification = TaskNotificationManager.isEvaluationCompletedByStudent(
                  task.id, 
                  user?.username || ''
                );
                console.log(`[loadPendingTasks] 🔍 Evaluation "${task.title}" completion status for ${user?.username}: ${isCompletedByNotification}`);
              } else {
                console.log(`[loadPendingTasks] ⚠️ TaskNotificationManager.isEvaluationCompletedByStudent not available`);
              }
            } catch (error) {
              console.error(`[loadPendingTasks] ❌ Error checking evaluation completion:`, error);
            }
            
            // ✅ CORRECCIÓN: Una evaluación se considera finalizada si está CALIFICADA o si se marcó como completada
            if (isGraded || isCompletedByNotification) {
              console.log(`[loadPendingTasks] ✅ FILTERING OUT completed evaluation: "${task.title}" (Graded: ${isGraded}, NotifCompleted: ${isCompletedByNotification})`);
              return false; // No mostrar evaluaciones ya finalizadas o calificadas
            } else {
              console.log(`[loadPendingTasks] ⏳ Evaluation "${task.title}" still pending for ${user?.username}`);
            }
          }
          
          // Para tareas regulares, verificar entregas
          const hasSubmitted = comments.some(comment => 
            comment.taskId === task.id && 
            comment.studentUsername === user?.username && 
            comment.isSubmission
          );
          
          console.log(`[loadPendingTasks] Task "${task.title}": assigned=${isAssigned}, approaching=${isApproaching}, submitted=${hasSubmitted}, graded=${isGraded}`);
          
          // ✅ UNIFICADO: La condición final es igual para TODAS las tareas:
          // Asignada, no vencida y NO CALIFICADA
          return isAssigned && isApproaching && !isGraded;
        });
        
        // Sort by due date (closest first)
        studentTasks.sort((a, b) => 
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        );
        
        setPendingTasks(studentTasks);
        console.log(`[loadPendingTasks] 📊 Results for ${user?.username}:`);
        console.log(`  - Total pending tasks: ${studentTasks.length}`);
        console.log(`  - Pending evaluations: ${studentTasks.filter(t => t.taskType === 'evaluation' || t.title.toLowerCase().includes('eval')).length}`);
        console.log(`  - Pending assignments: ${studentTasks.filter(t => t.taskType !== 'evaluation' && !t.title.toLowerCase().includes('eval')).length}`);
        console.log(`  - Task details:`, studentTasks.map(t => ({ title: t.title, type: t.taskType, dueDate: t.dueDate })));
      }
    } catch (error) {
      console.error('Error loading pending tasks:', error);
    }
  };

  const loadPasswordRequests = () => {
    try {
      const storedRequests = localStorage.getItem('password-reset-requests');
      
      if (storedRequests) {
        const requests: PasswordRequest[] = JSON.parse(storedRequests);
        
        // Filter pending requests only
        const pendingRequests = requests.filter(req => req.status === 'pending');
        
        // Sort by creation date (newest first)
        pendingRequests.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        setPasswordRequests(pendingRequests);
        
        // Update password requests state
        setPasswordRequests(pendingRequests);
      }
    } catch (error) {
      console.error('Error loading password requests:', error);
    }
  };

  // Cargar entregas de estudiantes para profesores
  const loadStudentSubmissions = () => {
    try {
      // Limpiar estado inicial para evitar datos residuales
      setUnreadStudentComments([]);
      setStudentSubmissions([]);
      
      // Cargar comentarios (que incluyen entregas) y tareas
      const storedComments = localStorage.getItem('smart-student-task-comments');
      const storedTasks = localStorage.getItem('smart-student-tasks');
      
      if (storedComments && storedTasks && user?.role === 'teacher') {
        const comments: TaskComment[] = JSON.parse(storedComments);
        const tasks: Task[] = JSON.parse(storedTasks);
        
        console.log(`[loadStudentSubmissions] Processing ${comments.length} comments for teacher ${user.username}`);
        console.log(`[loadStudentSubmissions] All tasks in system:`, tasks.map(t => ({ id: t.id, title: t.title, assignedBy: t.assignedBy })));
        console.log(`[loadStudentSubmissions] Felipe comments:`, comments.filter(c => c.studentUsername === 'felipe').map(c => ({ id: c.id, taskId: c.taskId, isSubmission: c.isSubmission, comment: c.comment?.substring(0, 50) })));
        
        // Filtrar tareas asignadas por este profesor ÚNICAMENTE - usar múltiples criterios como en dashboard
        const teacherTasks = tasks.filter(task => 
          task.assignedBy === user.username || 
          task.assignedById === user.id ||
          task.assignedBy === user.id ||
          task.assignedById === user.username
        );
        setClassTasks(teacherTasks);
        
        console.log(`[loadStudentSubmissions] Teacher ${user.username} has ${teacherTasks.length} assigned tasks`);
        console.log(`[loadStudentSubmissions] Teacher tasks:`, teacherTasks.map(t => ({ id: t.id, title: t.title, assignedBy: t.assignedBy })));
        
        // 🎯 CORRECCIÓN CRÍTICA: Solo usar tareas de este profesor, NO todas las tareas del sistema
        const teacherTaskIds = teacherTasks.map(task => task.id);
        console.log(`[loadStudentSubmissions] Teacher task IDs:`, teacherTaskIds);
        
        // � REMOVIDO: El fallback peligroso que incluía todas las tareas del sistema
        // Si no hay tareas del profesor, simplemente no mostrar nada
        if (teacherTaskIds.length === 0) {
          console.log(`[loadStudentSubmissions] Profesor ${user.username} no tiene tareas asignadas - No mostrar comentarios`);
          setStudentSubmissions([]);
          setUnreadStudentComments([]);
          return;
        }
        
        // Filtrar entregas de los estudiantes para las tareas de este profesor ÚNICAMENTE
        // que no hayan sido revisadas (no tienen calificación) y que no sean propias
        const submissions = comments
          .filter(comment => 
            comment.isSubmission && 
            teacherTaskIds.includes(comment.taskId) &&
            comment.studentUsername !== user.username && // Excluir entregas propias del profesor
            !comment.grade // Solo entregas sin calificar
          )
          .map(submission => {
            // Encontrar la tarea asociada para mostrar más información
            const task = tasks.find(t => t.id === submission.taskId);
            return { ...submission, task };
          });
        
        console.log(`[loadStudentSubmissions] Found ${submissions.length} ungraded submissions for teacher ${user.username}`);
        setStudentSubmissions(submissions);

        // Cargar comentarios de estudiantes (NO entregas) para tareas de este profesor
        // que no hayan sido leídos por el profesor
        // 🔄 CORRECCIÓN: Mejora para detectar comentarios de estudiantes aunque estén mal marcados
        const studentComments = comments
          .filter(comment => {
            // 🎯 FILTRO PRINCIPAL: Verificar si es un comentario para tareas de ESTE profesor únicamente
            const esParaProfesor = teacherTaskIds.includes(comment.taskId);
            
            // Verificar si es del propio profesor
            const esDelProfesor = comment.studentUsername === user.username;
            
            // Verificar si ya fue leído
            const fueLeido = comment.readBy?.includes(user.username);
            
            // ✅ MEJORA: No incluir comentarios que ya están en las notificaciones del sistema
            // Verificamos si hay una notificación de comentario para este usuario y tarea
            const yaEstaEnNotificaciones = TaskNotificationManager.getNotifications().some(notif => 
              notif.type === 'teacher_comment' && 
              notif.taskId === comment.taskId &&
              notif.fromUsername === comment.studentUsername &&
              !notif.readBy.includes(user.username) &&
              // Verificar que el timestamp sea similar (dentro de 1 minuto)
              Math.abs(new Date(notif.timestamp).getTime() - new Date(comment.timestamp).getTime()) < 60000
            );
            
            // 🎯 FILTRO CRÍTICO ADICIONAL: Para tareas específicas, verificar que este profesor sea el creador
            let profesorAutorizadoParaTareaEspecifica = true; // Por defecto permitir
            if (esParaProfesor && !esDelProfesor) {
              const task = tasks.find(t => t.id === comment.taskId);
              if (task && task.assignedTo === 'student' && task.assignedStudentIds) {
                // Es una tarea específica para estudiantes - verificar que este profesor sea el creador usando múltiples criterios
                const esCreadorDeTarea = task.assignedBy === user.username || 
                                       task.assignedById === user.id ||
                                       task.assignedBy === user.id ||
                                       task.assignedById === user.username;
                
                if (!esCreadorDeTarea) {
                  profesorAutorizadoParaTareaEspecifica = false;
                  console.log(`🚫 [loadStudentSubmissions] Profesor ${user.username} NO autorizado para tarea específica "${task.title}" - Creada por ${task.assignedBy}/${task.assignedById}`);
                } else {
                  console.log(`✅ [loadStudentSubmissions] Profesor ${user.username} SÍ autorizado para tarea específica "${task.title}" - Es el creador`);
                }
              }
            }
            
            // 🔧 NUEVO FILTRO DE PRIVACIDAD: Verificar si el estudiante está asignado a la tarea
            let estudianteAsignadoATarea = false;
            if (esParaProfesor && !esDelProfesor && profesorAutorizadoParaTareaEspecifica) {
              const task = tasks.find(t => t.id === comment.taskId);
              if (task) {
                // Obtener información del estudiante que hizo el comentario
                const usersText = localStorage.getItem('smart-student-users');
                const allUsers = usersText ? JSON.parse(usersText) : [];
                const studentData = allUsers.find((u: any) => u.username === comment.studentUsername);
                
                if (studentData) {
                  estudianteAsignadoATarea = checkStudentAssignmentToTask(task, studentData.id, comment.studentUsername);
                  
                  if (!estudianteAsignadoATarea) {
                    console.log(`🚫 [loadStudentSubmissions] Comentario de ${comment.studentUsername} filtrado - NO asignado a tarea "${task.title}"`);
                  } else {
                    console.log(`✅ [loadStudentSubmissions] Comentario de ${comment.studentUsername} permitido - SÍ asignado a tarea "${task.title}"`);
                  }
                } else {
                  console.log(`⚠️ [loadStudentSubmissions] Datos de estudiante ${comment.studentUsername} no encontrados`);
                }
              }
            } else {
              estudianteAsignadoATarea = true; // Si no es para verificar, permitir por defecto
            }
            
            console.log(`[loadStudentSubmissions] Analyzing comment from ${comment.studentUsername}:`, {
              taskId: comment.taskId,
              isSubmission: comment.isSubmission,
              belongsToTeacher: esParaProfesor,
              isFromTeacher: esDelProfesor,
              wasRead: fueLeido,
              alreadyInNotifications: yaEstaEnNotificaciones,
              studentAssignedToTask: estudianteAsignadoATarea,
              hasAttachments: comment.attachments && comment.attachments.length > 0,
              commentLength: comment.comment?.length || 0,
              text: comment.comment?.substring(0, 50) + '...'
            });
            
            // ✅ CORRECCIÓN: Solo incluir comentarios reales (NO entregas) en la sección "Comentarios No Leídos"
            // Las entregas deben aparecer solo en la sección de entregas pendientes
            const esComentario = !comment.isSubmission;
            
            // ✅ NUEVA CONDICIÓN: Incluir TODOS los filtros de seguridad
            const shouldInclude = esComentario && esParaProfesor && !esDelProfesor && !fueLeido && !yaEstaEnNotificaciones && estudianteAsignadoATarea && profesorAutorizadoParaTareaEspecifica;
            
            if (shouldInclude) {
              console.log(`✅ [loadStudentSubmissions] Including comment from ${comment.studentUsername} in notifications`);
            } else {
              console.log(`❌ [loadStudentSubmissions] Excluding comment from ${comment.studentUsername}: esComentario=${esComentario}, esParaProfesor=${esParaProfesor}, esDelProfesor=${esDelProfesor}, fueLeido=${fueLeido}, yaEstaEnNotificaciones=${yaEstaEnNotificaciones}, estudianteAsignado=${estudianteAsignadoATarea}, profesorAutorizado=${profesorAutorizadoParaTareaEspecifica}`);
            }
            
            // Incluir comentarios que no son del profesor, no han sido leídos, son para tareas de este profesor, no están duplicados en notificaciones, Y el estudiante está asignado a la tarea
            return shouldInclude;
          })
          .map(comment => {
            // Encontrar la tarea asociada para mostrar más información
            const task = tasks.find(t => t.id === comment.taskId);
            return { ...comment, task };
          });
        
        console.log(`[loadStudentSubmissions] Found ${studentComments.length} student comments for teacher ${user.username}`);
        setUnreadStudentComments(studentComments);
      } else {
        // Asegurar que los estados estén vacíos cuando no hay datos
        setUnreadStudentComments([]);
        setStudentSubmissions([]);
      }
    } catch (error) {
      console.error('Error loading student submissions:', error);
    }
  };

  // Cargar notificaciones pendientes de calificación para profesores
  const loadPendingGrading = () => {
    if (!user || user.role !== 'teacher') return;
    try {
      console.log('🔍 [DEBUG] Usuario actual para notificaciones:', user);
      const notifications = TaskNotificationManager.getUnreadNotificationsForUser(
        user.username,
        'teacher',
        user.id // Agregar ID del usuario
      );
      
      // Filtrar notificaciones de pending_grading (incluir todas, la lógica de duplicación se maneja en el renderizado)
      const pending = notifications.filter(n => 
        n.type === 'pending_grading' && 
        (n.targetUsernames.includes(user.username) || n.targetUsernames.includes(user.id))
      );
      
      console.log(`[NotificationsPanel] loadPendingGrading: Found ${pending.length} pending grading notifications`);
      setPendingGrading(pending);
    } catch (error) {
      console.error('Error loading pending grading:', error);
      setPendingGrading([]);
    }
  };

  const loadTaskNotifications = () => {
    if (!user) return;
    
    try {
      console.log(`[NotificationsPanel] Loading task notifications for user: ${user.username} (role: ${user.role})`);
      
      // 🧹 FILTRO DIRECTO MEJORADO: Eliminar TODAS las notificaciones task_completed de AMBOS localStorage
      if (user.role === 'teacher') {
        console.log('🚨 [FILTRO DIRECTO] Eliminando task_completed de AMBOS localStorage...');
        
        // Limpiar localStorage principal (smart-student-notifications)
        const allNotifications = JSON.parse(localStorage.getItem('smart-student-notifications') || '[]');
        const taskCompletedNotifications = allNotifications.filter((n: any) => n.type === 'task_completed');
        
        if (taskCompletedNotifications.length > 0) {
          console.log(`🎯 [FILTRO DIRECTO] Encontradas ${taskCompletedNotifications.length} notificaciones task_completed en localStorage principal`);
          const cleanedNotifications = allNotifications.filter((n: any) => n.type !== 'task_completed');
          localStorage.setItem('smart-student-notifications', JSON.stringify(cleanedNotifications));
          console.log(`✅ [FILTRO DIRECTO] Eliminadas del localStorage principal: ${taskCompletedNotifications.length}`);
        }
        
        // Limpiar localStorage de tareas (smart-student-task-notifications)
        const taskNotifications = JSON.parse(localStorage.getItem('smart-student-task-notifications') || '[]');
        const taskCompletedTaskNotifications = taskNotifications.filter((n: any) => n.type === 'task_completed');
        
        if (taskCompletedTaskNotifications.length > 0) {
          console.log(`🎯 [FILTRO DIRECTO] Encontradas ${taskCompletedTaskNotifications.length} notificaciones task_completed en task-notifications`);
          const cleanedTaskNotifications = taskNotifications.filter((n: any) => n.type !== 'task_completed');
          localStorage.setItem('smart-student-task-notifications', JSON.stringify(cleanedTaskNotifications));
          console.log(`✅ [FILTRO DIRECTO] Eliminadas de task-notifications: ${taskCompletedTaskNotifications.length}`);
        }
        
        // Forzar actualización del contador si se eliminaron notificaciones
        if (taskCompletedNotifications.length > 0 || taskCompletedTaskNotifications.length > 0) {
          window.dispatchEvent(new CustomEvent('teacher_counters_updated', {
            detail: { 
              type: 'auto_cleanup',
              action: 'task_completed_removed',
              removedFromMain: taskCompletedNotifications.length,
              removedFromTask: taskCompletedTaskNotifications.length
            }
          }));
        }
      }
      
      // 🧹 NUEVO: Ejecutar limpieza automática antes de cargar notificaciones
      console.log(`[NotificationsPanel] 🧹 Ejecutando limpieza automática para ${user.role}: ${user.username}`);
      TaskNotificationManager.cleanupFinalizedTaskNotifications();
      
      // 🔍 DEBUG: Verificar notificaciones RAW antes del filtrado
      const rawNotifications = TaskNotificationManager.getNotifications();
      const rawEvalCompleted = rawNotifications.filter(n => 
        n.type === 'task_completed' && 
        n.taskType === 'evaluation' && 
        n.targetUsernames.includes(user.username)
      );
      console.log(`[NotificationsPanel] 📊 RAW: ${rawNotifications.length} total, ${rawEvalCompleted.length} eval completadas para ${user.username}`);
      
      // 🔥 DEBUG TEMPORAL: Verificar las notificaciones RAW de evaluaciones completadas
      console.log('🚨 [DEBUG] RAW evaluaciones completadas encontradas:', rawEvalCompleted);
      rawEvalCompleted.forEach(n => {
        console.log(`   - ${n.taskTitle} | ReadBy: [${n.readBy?.join(', ')}] | Read: ${n.read} | Target: [${n.targetUsernames?.join(', ')}]`);
      });
      
      let notifications = TaskNotificationManager.getUnreadNotificationsForUser(
        user.username, 
        user.role as 'student' | 'teacher',
        user.id // Agregar ID del usuario
      );
      
      // 🚨 FILTRO ADICIONAL: Filtrar task_completed también después de obtener las notificaciones
      if (user.role === 'teacher') {
        const beforeFilter = notifications.length;
        notifications = notifications.filter(n => n.type !== 'task_completed');
        const afterFilter = notifications.length;
        
        if (beforeFilter !== afterFilter) {
          console.log(`🚨 [FILTRO ADICIONAL] Filtradas ${beforeFilter - afterFilter} notificaciones task_completed adicionales`);
        }
      }
      
      // 🔥 DEBUG TEMPORAL: Verificar si las evaluaciones llegan después del filtrado
      const postFilterEvalCompleted = notifications.filter(n => 
        n.type === 'task_completed' && n.taskType === 'evaluation'
      );
      console.log('🚨 [DEBUG] Evaluaciones completadas DESPUÉS del filtrado:', postFilterEvalCompleted.length);
      postFilterEvalCompleted.forEach(n => {
        console.log(`   - ${n.taskTitle} | ID: ${n.id}`);
      });
      
      console.log(`[NotificationsPanel] Raw notifications count: ${notifications.length}`);
      notifications.forEach((n, index) => {
        console.log(`[NotificationsPanel] ${index + 1}. Type: ${n.type}, TaskId: ${n.taskId}, From: ${n.fromUsername}, Target: ${n.targetUsernames.join(',')}, ReadBy: ${n.readBy.join(',')}`);
      });
      
      // 🔍 DEBUG ESPECÍFICO: Verificar notificaciones de evaluaciones completadas
      const evaluationCompletedNotifications = notifications.filter(n => 
        (n.type === 'task_completed' && n.taskType === 'evaluation') ||
        n.type === 'evaluation_completed'
      );
      console.log(`[NotificationsPanel] 🎯 Evaluaciones completadas encontradas: ${evaluationCompletedNotifications.length}`);
      evaluationCompletedNotifications.forEach((n, index) => {
        console.log(`[NotificationsPanel] 📝 Eval ${index + 1}: ${n.taskTitle || 'Sin título'} por ${n.fromDisplayName || n.fromUsername} para ${n.targetUsernames?.join(',') || 'Sin destinatarios'} - ID: ${n.id}`);
        console.log(`   - TaskID: ${n.taskId}, Type: ${n.type}, TaskType: ${n.taskType}, From: ${n.fromUsername}, Target: ${n.targetUsernames}, Read: ${n.read}, ReadBy: [${n.readBy?.join(',') || 'Sin lecturas'}]`);
      });
      
      // 🔍 DEBUG ADICIONAL: Verificar si el usuario actual está en las notificaciones de evaluaciones
      if (user?.role === 'teacher') {
        const evalNotificationsForTeacher = evaluationCompletedNotifications.filter(n => 
          n.targetUsernames.includes(user.username) && !n.readBy.includes(user.username)
        );
        console.log(`[NotificationsPanel] 🎯 Evaluaciones completadas PARA ESTE PROFESOR (${user.username}): ${evalNotificationsForTeacher.length}`);
        evalNotificationsForTeacher.forEach((n, index) => {
          console.log(`   - ${index + 1}. ${n.taskTitle} por ${n.fromDisplayName} - Timestamp: ${n.timestamp}`);
        });
      }
      
      // ✅ MEJORADO: Lógica unificada de filtrado para notificaciones
      if (user.role === 'student') {
        // Para estudiantes, filtrar CUALQUIER tarea que ya esté calificada Y verificar asignaciones específicas
        const filteredNotifications = notifications.filter(n => {
          // ✅ MEJORA: Unificar la lógica de filtrado para CUALQUIER tarea nueva
          if (n.type === 'new_task') {
            // 🎯 FILTRO CRÍTICO: Verificar asignación específica de tareas para estudiantes
            if (n.taskId) {
              const tasks = JSON.parse(localStorage.getItem('smart-student-tasks') || '[]');
              const task = tasks.find((t: any) => t.id === n.taskId);
              
              if (task && task.assignedTo === 'student' && task.assignedStudentIds) {
                // Es una tarea asignada a estudiantes específicos
                const users = JSON.parse(localStorage.getItem('smart-student-users') || '[]');
                const currentUser = users.find((u: any) => u.username === user.username);
                
                if (currentUser && !task.assignedStudentIds.includes(currentUser.id)) {
                  console.log(`🚫 [loadTaskNotifications] Filtrando notificación de tarea específica "${n.taskTitle}" para ${user.username} - No asignado`);
                  return false; // El estudiante NO está asignado a esta tarea específica
                }
                
                console.log(`✅ [loadTaskNotifications] Notificación de tarea específica "${n.taskTitle}" válida para ${user.username} - Sí asignado`);
              }
            }
            
            const isGraded = isTaskAlreadyGraded(n.taskId, user.username);
            
            if (isGraded) {
              console.log(`[NotificationsPanel] ✅ Filtering out notification for already graded task: ${n.taskTitle}`);
              return false; // No mostrar notificación de NINGUNA tarea (evaluación o no) que ya esté calificada
            }

            // Lógica adicional específica para evaluaciones basadas en notificaciones (mantenemos por compatibilidad)
            if (n.taskType === 'evaluation') {
               const isCompletedByNotification = TaskNotificationManager.isEvaluationCompletedByStudent(
                   n.taskId, user.username
               );
               if (isCompletedByNotification) {
                   console.log(`[NotificationsPanel] ✅ Filtering out notification for completed evaluation: ${n.taskTitle}`);
                   return false;
               }
            }
          }
          
          return true;
        });
        
        // 🔥 NUEVO: Si se filtraron evaluaciones completadas O tareas calificadas, también eliminarlas del localStorage
        const removedCount = notifications.length - filteredNotifications.length;
        if (removedCount > 0) {
          console.log(`🧹 [NotificationsPanel] Removing ${removedCount} completed/graded task notifications from storage`);
          
          // Eliminar evaluaciones completadas
          const completedEvaluationIds = notifications
            .filter(n => n.type === 'new_task' && n.taskType === 'evaluation')
            .filter(n => TaskNotificationManager.isEvaluationCompletedByStudent(n.taskId, user.username))
            .map(n => n.taskId);
          
          // 🔥 NUEVO: Eliminar tareas calificadas
          const gradedTaskIds = notifications
            .filter(n => n.type === 'new_task' && n.taskType === 'assignment')
            .filter(n => isTaskAlreadyGraded(n.taskId, user.username))
            .map(n => n.taskId);
          
          // Eliminar todas las notificaciones obsoletas
          [...completedEvaluationIds, ...gradedTaskIds].forEach(taskId => {
            TaskNotificationManager.removeNotificationsForTask(taskId, ['new_task']);
          });
          
          // 🔄 OPTIMIZADO: Recargar inmediatamente sin setTimeout para evitar delays
          const cleanedNotifications = TaskNotificationManager.getUnreadNotificationsForUser(
            user.username, 
            user.role as 'student' | 'teacher',
            user.id // Agregar ID del usuario
          );
          setTaskNotifications(cleanedNotifications);
          console.log(`✅ [NotificationsPanel] Immediately reloaded ${cleanedNotifications.length} clean notifications`);
          
          // � OPTIMIZADO: También recargar pendingTasks inmediatamente para consistencia
          console.log('🔄 [NotificationsPanel] Immediately reloading pendingTasks after notification cleanup...');
          loadPendingTasks();
        } else {
          setTaskNotifications(filteredNotifications);
        }
        
        console.log(`[NotificationsPanel] Loaded ${filteredNotifications.length} task notifications for ${user.username}`);
      } else if (user.role === 'teacher') {
        // Para profesores, filtrar notificaciones de tareas ya calificadas (pero NO evaluaciones)
        const filteredNotifications = notifications.filter(notification => {
          // Si es una notificación de tarea completada de tipo 'assignment' (no evaluación), verificar si ya fue calificada
          if (notification.type === 'task_completed' && notification.taskType !== 'evaluation') {
            const isGraded = isTaskAlreadyGraded(notification.taskId, notification.fromUsername);
            if (isGraded) {
              console.log(`🔥 [NotificationsPanel] Filtering out graded task notification: ${notification.taskTitle} by ${notification.fromUsername}`);
              return false; // No mostrar notificaciones de tareas ya calificadas
            }
          }
          // ✅ CORRECCIÓN: Para evaluaciones (taskType === 'evaluation'), siempre mostrar la notificación
          // Las evaluaciones no se "califican", solo se revisan resultados
          return true;
        });
        
        // 🔍 DEBUG FINAL: Verificar evaluaciones completadas después del filtrado final
        const finalEvalCompletedNotifications = filteredNotifications.filter(n => 
          n.type === 'task_completed' && n.taskType === 'evaluation'
        );
        console.log(`[NotificationsPanel] 🎯 FINAL: Evaluaciones completadas después de filtros: ${finalEvalCompletedNotifications.length}`);
        finalEvalCompletedNotifications.forEach((n, index) => {
          console.log(`   - ${index + 1}. ${n.taskTitle} por ${n.fromDisplayName} (ID: ${n.id})`);
        });
        
        setTaskNotifications(filteredNotifications);
        
        console.log(`[NotificationsPanel] Teacher ${user.username} - all notifications:`, notifications.length);
        
        // Debug para tareas pendientes del sistema
        const systemPendingTasks = notifications.filter(n => 
          n.type === 'pending_grading' && 
          n.fromUsername === 'system' &&
          n.taskType === 'assignment'
        );
        console.log(`[NotificationsPanel] ${user.username} system pending tasks:`, systemPendingTasks.length);
        
        // Debug para evaluaciones pendientes del sistema
        const systemPendingEvaluations = notifications.filter(n => 
          n.type === 'pending_grading' && 
          n.fromUsername === 'system' &&
          n.taskType === 'evaluation'
        );
        console.log(`[NotificationsPanel] ${user.username} system pending evaluations:`, systemPendingEvaluations.length);
        
        // Debug para evaluaciones pendientes
        const evaluationNotifications = notifications.filter(n => 
          (n.type === 'pending_grading' || n.type === 'task_completed') && 
          n.taskType === 'evaluation'
        );
        
        console.log(`[NotificationsPanel] ${user.username} evaluation notifications:`, evaluationNotifications.length);
        
        // Debug para tareas pendientes
        const taskNotifications = notifications.filter(n => 
          (n.type === 'pending_grading' || n.type === 'task_completed') && 
          n.taskType === 'assignment'
        );
        
        console.log(`[NotificationsPanel] ${user.username} task notifications:`, taskNotifications.length);
      }
    } catch (error) {
      console.error('Error loading task notifications:', error);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      // Get user's preferred language or default to browser language
      const userLang = document.documentElement.lang || 'es';
      return new Intl.DateTimeFormat(userLang === 'es' ? 'es-ES' : 'en-US', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (e) {
      return dateString;
    }
  };

  const getRelativeTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return translate('today');
      } else if (diffDays === 1) {
        return translate('yesterday');
      } else {
        return translate('daysAgo', { days: diffDays.toString() });
      }
    } catch (e) {
      return '';
    }
  };

  const handleReadAll = () => {
    setIsMarking(true);
    
    if (user?.role === 'student') {
      try {
        let hasUpdates = false;
        
        // Mark all comments as read
        if (unreadComments.length > 0) {
          const storedComments = localStorage.getItem('smart-student-task-comments');
          if (storedComments) {
            const comments: TaskComment[] = JSON.parse(storedComments);
            const updatedComments = comments.map(comment => {
              // Solo marcar como leído si no es del propio usuario y no está ya leído
              if (!comment.readBy?.includes(user.username) && comment.studentUsername !== user.username) {
                hasUpdates = true;
                return {
                  ...comment,
                  isNew: false,
                  readBy: [...(comment.readBy || []), user.username]
                };
              }
              return comment;
            });
            
            localStorage.setItem('smart-student-task-comments', JSON.stringify(updatedComments));
          }
        }
        
        // Mark task notifications as read (except new_task notifications which should only be marked as read on submission)
        if (taskNotifications.length > 0) {
          const notifications = TaskNotificationManager.getNotifications();
          const updatedNotifications = notifications.map(notification => {
            if (
              notification.targetUsernames.includes(user.username) &&
              !notification.readBy.includes(user.username) &&
              // 🔥 MEJORA: Solo marcar como leídos los comentarios, no las tareas/evaluaciones pendientes
              notification.type !== 'new_task' && 
              notification.type !== 'pending_grading'
            ) {
              hasUpdates = true;
              return {
                ...notification,
                readBy: [...notification.readBy, user.username],
                read: notification.readBy.length + 1 >= notification.targetUsernames.length
              };
            }
            return notification;
          });
          
          TaskNotificationManager.saveNotifications(updatedNotifications);
        // NUEVO: Marcar todas las comunicaciones como leídas para el estudiante
        try {
          const commRaw = localStorage.getItem('smart-student-communications');
          if (commRaw && user?.id) {
            const all: any[] = JSON.parse(commRaw);
            const courses = JSON.parse(localStorage.getItem('smart-student-courses') || '[]');
            const assignments = JSON.parse(localStorage.getItem('smart-student-student-assignments') || '[]');
            const myAssignments = assignments.filter((a: any) => a && a.studentId === user.id);
            const active = (user as any).activeCourses as string[] | undefined;
            const studentSectionName = (user as any).sectionName;

            const getCourseName = (id?: string, fb?: string) => {
              if (!id) return fb || '';
              return courses.find((c: any) => c.id === id)?.name || fb || '';
            };

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

            const updatedAll = all.map(c => {
              if (belongsToStudent(c)) {
                const readBy = c.readBy || [];
                if (!readBy.includes(user.id)) {
                  hasUpdates = true;
                  return { ...c, readBy: [...readBy, user.id], readAt: { ...(c.readAt || {}), [user.id]: new Date().toISOString() } };
                }
                if (!c.readAt || !c.readAt[user.id]) {
                  hasUpdates = true;
                  return { ...c, readAt: { ...(c.readAt || {}), [user.id]: new Date().toISOString() } };
                }
              }
              return c;
            });
            if (hasUpdates) {
              localStorage.setItem('smart-student-communications', JSON.stringify(updatedAll));
              // refrescar lista local del panel
              loadStudentCommunications();
            }
          }
        } catch (e) {
          console.warn('[NotificationsPanel] Error marcando comunicaciones como leídas:', e);
        }
        }
        
        if (hasUpdates) {
          // Update internal state - only clear comments and comment notifications, NOT pending tasks
          setUnreadComments([]);
          // ✅ MEJORA: Filtrar para mantener tareas y evaluaciones pendientes
          const filteredNotifications = taskNotifications.filter(notification => 
            notification.type === 'new_task' || notification.type === 'pending_grading'
          );
          setTaskNotifications(filteredNotifications);
          // Note: We don't clear pendingTasks as these should remain until completed/submitted
          
          // Restablecer el estado del botón después de un breve retraso
          setTimeout(() => setIsMarking(false), 500);
          
          // ✅ NUEVA MEJORA: Disparar eventos específicos para actualizar contadores del dashboard
          console.log('🔄 [MARK_ALL_READ] Disparando eventos para actualizar contadores del dashboard...');
          
          // Restablecer el estado del botón después de un breve retraso
          setTimeout(() => setIsMarking(false), 500);
          
          // ✅ NUEVA MEJORA: Disparar evento específico para actualizar contadores del dashboard (IGUAL QUE PROFESOR)
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('updateDashboardCounts', {
              detail: { userRole: user.role, action: 'mark_all_read' }
            }));
          }, 100);
          
          // Disparar evento específico para estudiantes
          window.dispatchEvent(new CustomEvent('studentCommentsUpdated', { 
            detail: { 
              username: user.username,
              action: 'mark_all_read'
            } 
          }));
          
          // Trigger events for other components to update
          document.dispatchEvent(new Event('commentsUpdated'));
          window.dispatchEvent(new CustomEvent('taskNotificationsUpdated'));
          window.dispatchEvent(new Event('storage'));
        }
        
        // Close panel
        setOpen(false);
      } catch (error) {
        console.error('Error marking all notifications as read:', error);
      }
    } else if (user?.role === 'teacher') {
      try {
        let hasUpdates = false;
        
        // Mark all student comments as read for teacher
        if (unreadStudentComments.length > 0) {
          const storedComments = localStorage.getItem('smart-student-task-comments');
          if (storedComments) {
            const comments: TaskComment[] = JSON.parse(storedComments);
            const updatedComments = comments.map(comment => {
              // Solo marcar como leído si no es del propio profesor y no está ya leído
              if (!comment.readBy?.includes(user.username) && comment.studentUsername !== user.username) {
                hasUpdates = true;
                return {
                  ...comment,
                  isNew: false,
                  readBy: [...(comment.readBy || []), user.username]
                };
              }
              return comment;
            });
            
            localStorage.setItem('smart-student-task-comments', JSON.stringify(updatedComments));
          }
        }
        
        // Mark only COMMENT notifications as read for teacher (NOT task assignments or pending grading)
        if (taskNotifications.length > 0) {
          const notifications = TaskNotificationManager.getNotifications();
          const updatedNotifications = notifications.map(notification => {
            if (
              notification.targetUsernames.includes(user.username) &&
              !notification.readBy.includes(user.username) &&
              // ✅ MEJORA: Solo marcar como leídos los comentarios, no las tareas/evaluaciones pendientes
              notification.type === 'teacher_comment'
            ) {
              hasUpdates = true;
              return {
                ...notification,
                readBy: [...notification.readBy, user.username],
                read: notification.readBy.length + 1 >= notification.targetUsernames.length
              };
            }
            return notification;
          });
          
          TaskNotificationManager.saveNotifications(updatedNotifications);
        }
        
        if (hasUpdates) {
          // Update internal state - only clear comments, NOT pending tasks/grading notifications
          setUnreadStudentComments([]);
          
          // ✅ MEJORA: Filtrar para mantener tareas y evaluaciones pendientes
          const filteredTaskNotifications = taskNotifications.filter(notification => 
            notification.type === 'pending_grading' || 
            notification.type === 'new_task' ||
            notification.type === 'task_submission' ||
            notification.type === 'task_completed'
          );
          setTaskNotifications(filteredTaskNotifications);
          
          // 🧹 NUEVO: Ejecutar limpieza automática después de marcar como leído
          console.log('🧹 [MARK_ALL_READ] Ejecutando limpieza automática...');
          TaskNotificationManager.cleanupFinalizedTaskNotifications();
          
          // Restablecer el estado del botón después de un breve retraso
          setTimeout(() => setIsMarking(false), 500);
          
          // Note: studentSubmissions are NOT cleared here because they represent
          // actual student work that needs to be reviewed and graded by the teacher
          
          // ✅ NUEVA MEJORA: Disparar evento específico para actualizar contadores del dashboard
          console.log('🔄 [MARK_ALL_READ] Disparando evento para actualizar contadores del dashboard...');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('updateDashboardCounts', {
              detail: { userRole: user.role, action: 'mark_all_read' }
            }));
          }, 100);
          
          // Trigger events for other components to update
          document.dispatchEvent(new Event('commentsUpdated'));
          window.dispatchEvent(new CustomEvent('taskNotificationsUpdated'));
          window.dispatchEvent(new Event('storage'));
        }
        
        // Close panel
        setOpen(false);
      } catch (error) {
        console.error('Error marking all notifications as read for teacher:', error);
      }
    } else if (user?.role === 'guardian') {
      // 🔧 NUEVO: Lógica para marcar todas las comunicaciones como leídas para apoderados
      try {
        let hasUpdates = false;
        
        const commRaw = localStorage.getItem('smart-student-communications');
        if (commRaw && user?.id) {
          const all: any[] = JSON.parse(commRaw);
          const currentYear = new Date().getFullYear();
          const assignments = JSON.parse(localStorage.getItem(`smart-student-student-assignments-${currentYear}`) || 
            localStorage.getItem('smart-student-student-assignments') || '[]');
          
          // Obtener estudiantes asignados al apoderado
          let assignedStudentIds: string[] = [];
          
          // Prioridad 1: smart-student-guardians-{year}
          const guardiansForYear = JSON.parse(localStorage.getItem(`smart-student-guardians-${currentYear}`) || '[]');
          const guardianFromYear = guardiansForYear.find((g: any) => 
            g.username?.toLowerCase() === user.username?.toLowerCase() || g.id === user.id
          );
          if (guardianFromYear?.studentIds?.length > 0) {
            assignedStudentIds = guardianFromYear.studentIds;
          }
          
          // Prioridad 2: guardian-student-relations
          if (assignedStudentIds.length === 0) {
            let guardianRelations = JSON.parse(localStorage.getItem(`smart-student-guardian-student-relations-${currentYear}`) || '[]');
            if (guardianRelations.length === 0) {
              guardianRelations = JSON.parse(localStorage.getItem('smart-student-guardian-student-relations') || '[]');
            }
            assignedStudentIds = guardianRelations
              .filter((rel: any) => rel.guardianId === user.id || rel.guardianUsername === user.username)
              .map((rel: any) => rel.studentId);
          }
          
          // Prioridad 3: smart-student-users
          if (assignedStudentIds.length === 0) {
            const storedUsers = localStorage.getItem('smart-student-users');
            if (storedUsers) {
              const usersData = JSON.parse(storedUsers);
              const fullUserData = usersData.find((u: any) => 
                u.username?.toLowerCase() === user.username?.toLowerCase()
              );
              if (fullUserData?.studentIds?.length > 0) {
                assignedStudentIds = fullUserData.studentIds;
              }
            }
          }
          
          const updatedAll = all.map(c => {
            // Para comunicaciones de estudiante específico
            if (c.type === 'student' && assignedStudentIds.includes(c.targetStudent)) {
              const readByKey = `${user.id}_forStudent_${c.targetStudent}`;
              const readBy = c.readBy || [];
              if (!readBy.includes(readByKey) && !readBy.includes(user.id)) {
                hasUpdates = true;
                return { ...c, readBy: [...readBy, readByKey], readAt: { ...(c.readAt || {}), [readByKey]: new Date().toISOString() } };
              }
            }
            
            // Para comunicaciones de curso
            if (c.type === 'course' && c.targetCourse) {
              const studentAssignmentsForGuardian = assignments.filter((a: any) => 
                a && assignedStudentIds.includes(a.studentId)
              );
              const matchingAssignments = studentAssignmentsForGuardian.filter((a: any) => {
                const courseMatch = a.courseId === c.targetCourse;
                const sectionMatch = !c.targetSection || a.sectionId === c.targetSection;
                return courseMatch && sectionMatch;
              });
              
              // Marcar como leída para cada estudiante que pertenece al curso
              let newReadBy = [...(c.readBy || [])];
              let newReadAt = { ...(c.readAt || {}) };
              matchingAssignments.forEach((assignment: any) => {
                const readByKey = `${user.id}_forStudent_${assignment.studentId}`;
                if (!newReadBy.includes(readByKey)) {
                  hasUpdates = true;
                  newReadBy.push(readByKey);
                  newReadAt[readByKey] = new Date().toISOString();
                }
              });
              
              if (newReadBy.length > (c.readBy || []).length) {
                return { ...c, readBy: newReadBy, readAt: newReadAt };
              }
            }
            
            return c;
          });
          
          if (hasUpdates) {
            localStorage.setItem('smart-student-communications', JSON.stringify(updatedAll));
            loadStudentCommunications();
            
            // Disparar eventos para actualizar contadores
            window.dispatchEvent(new CustomEvent('studentCommunicationsUpdated', { detail: { action: 'mark_all_read' } }));
            window.dispatchEvent(new CustomEvent('updateDashboardCounts', {
              detail: { userRole: user.role, action: 'mark_all_read' }
            }));
          }
        }
        
        setTimeout(() => setIsMarking(false), 500);
        setOpen(false);
      } catch (error) {
        console.error('Error marking all communications as read for guardian:', error);
        setTimeout(() => setIsMarking(false), 500);
      }
    }
  };

  // Retorna el componente del panel de notificaciones
  return (
    <div className="relative">
      <Popover open={open} onOpenChange={(newOpen) => {
        setOpen(newOpen);
        
        // 🔄 NUEVO: Recargar datos cuando se abre el panel para ambos roles
        if (newOpen) {
          console.log(`🔄 [PANEL_OPEN] Panel abierto por ${user?.role}: ${user?.username} - Recargando datos...`);
          
          if (user?.role === 'student') {
            console.log('👨‍🎓 [STUDENT_PANEL_OPEN] Recargando datos de estudiante...');
            loadTaskNotifications();
            loadPendingTasks();
            loadUnreadComments();
      loadStudentCommunications();
          } else if (user?.role === 'teacher') {
            console.log('👩‍🏫 [TEACHER_PANEL_OPEN] Ejecutando limpieza automática de notificaciones...');
            TaskNotificationManager.cleanupFinalizedTaskNotifications();
            // Pequeño delay para que la limpieza termine antes de recargar
            setTimeout(() => {
              loadTaskNotifications();
              loadStudentSubmissions();
              loadPendingGrading();
              loadUnreadComments();
              computePendingAttendance();
            }, 100);
          }
        }
      }}>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon"
            className={`relative transition-all duration-200 ${
              open 
                ? 'bg-primary/15 text-primary hover:bg-primary/20 ring-2 ring-primary/30 shadow-md' 
                : 'hover:bg-secondary/80 hover:text-foreground'
            }`}
            title={translate('notifications')}
          >
            <Bell className={`h-5 w-5 transition-all duration-200 ${
              open ? 'text-primary scale-110' : 'text-muted-foreground hover:text-foreground'
            }`} />
            {count > 0 && (
              <Badge 
                className="absolute -top-1 -right-1 bg-red-500 text-white hover:bg-red-600 text-xs px-[0.4rem] py-[0.1rem] rounded-full"
                title={translate('unreadNotificationsCount', { count: String(count) })}
              >
                {count > 99 ? '99+' : count}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        
  <PopoverContent className="w-80 md:w-96 p-0 max-h-[80vh] overflow-y-auto" align="end">
          <Card className="border-0 h-full flex flex-col max-h-[80vh]">
            <CardHeader className="pb-2 pt-4 px-4 flex-shrink-0">
              <CardTitle className="text-lg font-semibold flex items-center justify-between">
                <span>{translate('notifications')}</span>
                {/* Botón Marcar todo como leído - Para estudiantes, profesores y apoderados */}
                {((user?.role === 'student' && (unreadComments.length > 0 || taskNotifications.length > 0 || (studentCommunications.filter(c => !(c.readBy||[]).includes(user?.id)).length > 0))) ||
                  (user?.role === 'teacher' && (unreadStudentComments.length > 0 || pendingGrading.length > 0 || taskNotifications.length > 0)) ||
                  (user?.role === 'guardian' && studentCommunications.length > 0)) && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={handleReadAll}
                    disabled={isMarking}
                    className={`text-xs transition-colors duration-200 ${
                      isMarking 
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300' 
                        : 'text-muted-foreground hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {translate('markAllAsRead')}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            
            <ScrollArea className="flex-1 h-full">
              <div className="max-h-[70vh] px-1">
                <CardContent className="p-0 space-y-0">
                  {/* Admin: Password Reset Requests */}
              {user?.role === 'admin' && (
                <div className="divide-y divide-border">
                  {passwordRequests.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground">
                      {translate('noPasswordRequests')}
                    </div>
                  ) : (
                    passwordRequests.map(request => (
                      <div key={request.id} className="p-4 hover:bg-muted/50">
                        <div className="flex items-start gap-2">
                          <div className="bg-red-100 p-2 rounded-full">
                            <Key className="h-4 w-4 text-red-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm">
                                {translate('passwordResetRequested')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {getRelativeTime(request.createdAt)}
                              </p>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {translate('requestFromUser', { username: request.username })}
                            </p>
                            <Link 
                              href="/dashboard/solicitudes"
                              className="inline-block mt-2 text-xs text-primary hover:underline"
                            >
                              {translate('viewRequest')}
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              
              {/* Student: Notifications in correct order */}
              {user?.role === 'student' && (
                <div>
                  {(() => {
                    // 🚨 SAFETY CHECK: Verificar que user existe y tiene las propiedades necesarias
                    if (!user || !user.username || !user.role) {
                      console.error('🚨 [NotificationsPanel] USER NOT PROPERLY DEFINED:', user);
                      return null;
                    }
                    
                    console.log('🔍 [NotificationsPanel] RENDERING STUDENT SECTION with:', {
                      username: user?.username,
                      role: user?.role,
                      unreadComments: unreadComments.length,
                      pendingTasks: pendingTasks.length, 
                      taskNotifications: taskNotifications.length
                    });
                    
                    console.log('🎯 [NotificationsPanel] Student notification counts:', {
                      unreadComments: unreadComments.length,
                      pendingTasks: pendingTasks.length,
                      taskNotifications: taskNotifications.length,
                      pendingEvaluations: pendingTasks.filter(task => task.taskType === 'evaluation' || task.title.toLowerCase().includes('eval')).length,
                      newEvaluationNotifications: taskNotifications.filter(n => n.type === 'new_task' && n.taskType === 'evaluation').length
                    });
                    
                    // 🚨 DEBUGGING: Log detallado de cada array
                    console.log('📋 DETAILED unreadComments:', unreadComments);
                    console.log('📋 DETAILED pendingTasks:', pendingTasks);
                    console.log('📋 DETAILED taskNotifications:', taskNotifications);
                    
                    return null; // Este IIFE solo hace logging
                  })()}
                  
                  {/* 🔥 SIMPLIFICADO: Mostrar mensaje directo sin notificaciones */}
                  {(() => {
                    const unreadCommsCount = studentCommunications.filter(c => !(c.readBy||[]).includes(user?.id)).length;
                    const showEmpty = unreadComments.length === 0 && pendingTasks.length === 0 && taskNotifications.length === 0 && unreadCommsCount === 0;
                    console.log('🧮 [NotificationsPanel] EMPTY CHECK:', { unreadComments: unreadComments.length, pendingTasks: pendingTasks.length, taskNotifications: taskNotifications.length, unreadCommsCount, showEmpty });
                    return showEmpty;
                  })() ? (
                    <>
                      {console.log('🎯 [NotificationsPanel] MOSTRANDO MENSAJE SIN NOTIFICACIONES - ESTUDIANTE')}
                      <div className="py-8 px-6 text-center">
                        {/* Contenedor principal con animación sutil */}
                        <div className="relative">
                          {/* Círculo de fondo con gradiente */}
                          <div className="mx-auto w-24 h-24 mb-6 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full flex items-center justify-center shadow-lg">
                            <div className="w-16 h-16 bg-gradient-to-br from-green-200 to-emerald-200 dark:from-green-800/40 dark:to-emerald-800/40 rounded-full flex items-center justify-center">
                              <span className="text-2xl animate-bounce">�</span>
                            </div>
                          </div>
                          
                          {/* Mensaje principal */}
                          <div className="space-y-3 mb-6">
                            <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                              {translate('allCaughtUpTitle')}
                            </h3>
                            <p className="text-gray-600 dark:text-gray-300 text-sm">
                              {translate('allCaughtUpMessage')}
                            </p>
                            <p className="text-gray-500 dark:text-gray-400 text-xs">
                              {translate('allCaughtUpSubtext')}
                            </p>
                          </div>
                          
                          {/* Iconos con checks - representando todo completado */}
                          <div className="flex justify-center items-center space-x-6 mb-4">
                            {/* Evaluaciones completadas */}
                            <div className="flex flex-col items-center space-y-2">
                              <div className="relative">
                                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/40 rounded-full flex items-center justify-center">
                                  <ClipboardList className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                  <span className="text-white text-xs">✓</span>
                                </div>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{translate('evaluationsSection')}</span>
                            </div>
                            
                            {/* Tareas completadas */}
                            <div className="flex flex-col items-center space-y-2">
                              <div className="relative">
                                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/40 rounded-full flex items-center justify-center">
                                  <Clock className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                  <span className="text-white text-xs">✓</span>
                                </div>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{translate('tasksSection')}</span>
                            </div>
                            
                            {/* Comentarios al día */}
                            <div className="flex flex-col items-center space-y-2">
                              <div className="relative">
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
                                  <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                  <span className="text-white text-xs">✓</span>
                                </div>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{translate('commentsSection')}</span>
                            </div>
                          </div>
                          
                          {/* Mensaje motivacional */}
                          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                            <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                              {translate('keepItUpMessage')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="divide-y divide-border">
                      {/* 0. COMUNICACIONES (NUEVA SECCIÓN) - Para estudiantes y apoderados */}
                      {(user?.role === 'student' || user?.role === 'guardian') && studentCommunications.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-500">
                            <h3 className="text-sm font-medium text-red-800 dark:text-red-200 flex items-center gap-2">
                              <Megaphone className="h-4 w-4" />
                              {/* 🔧 CORRECCIÓN: Usar identificador compuesto para contar no leídas */}
                              {translate('communicationsSection') || 'Comunicaciones'} ({studentCommunications.filter(c => {
                                const studentId = c.studentInfo?.id;
                                const readByKey = (user?.role === 'guardian' && studentId) ? `${user.id}_forStudent_${studentId}` : user?.id;
                                return !((c.readBy||[]).includes(readByKey)) && !((c.readBy||[]).includes(user?.id));
                              }).length})
                            </h3>
                          </div>
                          {studentCommunications.map(comm => {
                            // Recuperar nombres de curso y sección si están disponibles
                            const coursesRaw = typeof window !== 'undefined' ? localStorage.getItem('smart-student-courses') : null;
                            const sectionsRaw = typeof window !== 'undefined' ? localStorage.getItem('smart-student-sections') : null;
                            const courses = coursesRaw ? JSON.parse(coursesRaw) : [];
                            const sections = sectionsRaw ? JSON.parse(sectionsRaw) : [];
                            const courseName = comm.targetCourseName || courses.find((c: any) => c.id === comm.targetCourse)?.name || '';
                            const sectionName = comm.targetSectionName || sections.find((s: any) => s.id === comm.targetSection)?.name || '';
                            const csLabel = [courseName, sectionName].filter(Boolean).join(' ');
                            // Detectar si es una comunicación por presentación compartida
                            const isSlideShare = !!(comm?.attachment?.type === 'slide');
                            const defaultShareMsgs = [
                              'El profesor ha compartido una presentación de clase.',
                              'The teacher has shared a class presentation.'
                            ];
                            // Para apoderados: mostrar info del estudiante
                            const studentInfo = comm.studentInfo;
                            return (
                            <div key={comm.id} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-3">
                                <div className="bg-red-100 dark:bg-red-800 p-2 rounded-full">
                                  <Megaphone className="h-4 w-4 text-red-600 dark:text-red-300" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    {/* Título dividido en 2 líneas: prefijo y tema */}
                                    <div className="min-w-0 flex-1">
                                      {(() => {
                                        const raw = String(comm.title || '');
                                        const parts = raw.split(':');
                                        const prefix = parts.shift()?.trim() || raw;
                                        const topic = parts.join(':').trim();
                                        return (
                                          <div className="text-red-800 dark:text-red-200">
                                            <span className="block font-medium text-sm truncate">{prefix}</span>
                                            {topic && (
                                              <span className="block text-[13px] text-red-700 dark:text-red-300 break-words">
                                                {topic}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    {/* 🔧 CORRECCIÓN: Usar identificador compuesto para verificar estado de lectura */}
                                    {(() => {
                                      const studentId = comm.studentInfo?.id;
                                      const readByKey = (user?.role === 'guardian' && studentId) 
                                        ? `${user.id}_forStudent_${studentId}` 
                                        : user?.id;
                                      const isUnread = !((comm.readBy||[]).includes(readByKey)) && !((comm.readBy||[]).includes(user?.id));
                                      return (
                                        <Badge variant="outline" className={`shrink-0 text-xs ${isUnread ? 'border-red-300 text-red-700 bg-red-50 dark:border-red-600 dark:text-red-300 dark:bg-red-900/30' : 'border-gray-200 text-gray-600 bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:bg-gray-900/20'}`}>
                                          {isUnread ? translate('unreadCommunication') || 'Sin leer' : translate('readCommunication') || 'Leído'}
                                        </Badge>
                                      );
                                    })()}
                                  </div>
                                  {/* Para apoderados: mostrar nombre del estudiante */}
                                  {user?.role === 'guardian' && studentInfo && (
                                    <p className="text-xs text-purple-600 dark:text-purple-300 mt-1 font-medium truncate">
                                      👤 {studentInfo.name}{studentInfo.courseName ? ` (${studentInfo.courseName} ${studentInfo.sectionName || ''})` : ''}
                                    </p>
                                  )}
                                  {/* Meta: curso-sección en una línea y debajo profesor • fecha */}
                                  {csLabel && !studentInfo ? (
                                    <p className="text-xs text-muted-foreground mt-1 truncate">
                                      <span className="font-medium text-red-700 dark:text-red-300">{csLabel}</span>
                                    </p>
                                  ) : null}
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {getDisplayNameById(comm.senderId)} • {formatDate(comm.createdAt)}
                                  </p>
                                  {/* Adelanto del contenido para mejor claridad */}
                                  {comm.content && !isSlideShare && !defaultShareMsgs.includes(String(comm.content).trim()) ? (
                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2 break-words">
                                      {comm.content}
                                    </p>
                                  ) : null}
                                  <div className="mt-2">
                                    <Link href={`/dashboard/comunicaciones?commId=${encodeURIComponent(comm.id)}#open`} className="inline-block mt-1 text-xs text-red-600 dark:text-red-300 hover:underline" onClick={(e) => {
                                      try {
                                        if (!user?.id) return;
                                        const raw = localStorage.getItem('smart-student-communications');
                                        if (!raw) return;
                                        const list = JSON.parse(raw);
                                        
                                        // 🔧 CORRECCIÓN APODERADO: Extraer ID original y studentId si es un ID modificado con _studentId
                                        let originalCommId = comm.id;
                                        let extractedStudentId = comm.studentInfo?.id;
                                        
                                        if (user.role === 'guardian' && comm.id.includes('_')) {
                                          const parts = comm.id.split('_');
                                          if (parts.length >= 2) {
                                            const lastPart = parts[parts.length - 1];
                                            if (lastPart.length > 10 || lastPart.includes('-')) {
                                              originalCommId = parts.slice(0, -1).join('_');
                                              extractedStudentId = extractedStudentId || lastPart;
                                              console.log(`🔧 [Guardian NotificationsPanel] Extracted original ID: ${originalCommId}, studentId: ${extractedStudentId}`);
                                            }
                                          }
                                        }
                                        
                                        // 🔧 Usar identificador compuesto para apoderados con múltiples estudiantes
                                        const readByKey = (user.role === 'guardian' && extractedStudentId) 
                                          ? `${user.id}_forStudent_${extractedStudentId}` 
                                          : user.id;
                                        
                                        const updated = list.map((c: any) => {
                                          // 🔧 Buscar tanto por ID original como por ID modificado
                                          if (c.id !== comm.id && c.id !== originalCommId) return c;
                                          const readBy = c.readBy || [];
                                          if (readBy.includes(readByKey)) return c;
                                          return { ...c, readBy: [...readBy, readByKey], readAt: { ...(c.readAt || {}), [readByKey]: new Date().toISOString() } };
                                        });
                                        localStorage.setItem('smart-student-communications', JSON.stringify(updated));
                                        // Actualizar panel inmediatamente y notificar
                                        loadStudentCommunications();
                                        window.dispatchEvent(new CustomEvent('studentCommunicationsUpdated', { detail: { action: 'read', id: originalCommId } }));
                                        window.dispatchEvent(new CustomEvent('updateDashboardCounts', { detail: { source: 'communications', action: 'read_one' } }));
                                      } catch {}
                                    }}>
                                      {translate('viewCommunicationButton') || 'Ver comunicación'}
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )})}
                        </>
                      )}
                      {/* 1. EVALUACIONES PENDIENTES - FIRST POSITION */}
                      {(pendingTasks.filter(task => task.taskType === 'evaluation').length > 0 || 
                        taskNotifications.filter(n => n.type === 'new_task' && n.taskType === 'evaluation').length > 0) && (
                        <>
                          <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-400 dark:border-purple-500">
                            <h3 className="text-sm font-medium text-purple-800 dark:text-purple-200">
                              {translate('pendingEvaluations') || 'Evaluaciones Pendientes'} ({pendingTasks.filter(task => task.taskType === 'evaluation').length + 
                                taskNotifications.filter(n => n.type === 'new_task' && n.taskType === 'evaluation').length})
                            </h3>
                          </div>
                          
                          {/* Existing pending evaluations */}
                          {pendingTasks
                            .filter(task => task.taskType === 'evaluation')
                            .slice(0, 2)
                            .map(task => (
                            <div key={`pending-eval-${task.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-3">
                                <div className="bg-purple-100 dark:bg-purple-800 p-2 rounded-full">
                                  <ClipboardList className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm text-purple-800 dark:text-purple-200">
                                      {task.title}
                                    </p>
                                    <Badge variant="outline" className="text-xs border-purple-200 dark:border-purple-600 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 font-medium flex flex-col items-center justify-center text-center leading-tight min-w-[2.5rem] h-8">
                                      {splitTextForBadge(getCourseAbbreviation(task.subject)).map((line, idx) => (
                                        <span key={idx} className="block">{line}</span>
                                      ))}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {TaskNotificationManager.getCourseNameById(task.course)} • {formatDate(task.dueDate)}
                                  </p>
                                  <div className="mt-2">
                                    {createSafeTaskLink(task.id, '', translate('viewEvaluationButton'), 'evaluation')}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* New evaluation notifications */}
                          {taskNotifications
                            .filter(n => n.type === 'new_task' && n.taskType === 'evaluation')
                            .slice(0, 3 - pendingTasks.filter(task => task.taskType === 'evaluation').length)
                            .map(notification => (
                            <div key={`new-eval-${notification.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-3">
                                <div className="bg-purple-100 dark:bg-purple-800 p-2 rounded-full">
                                  <ClipboardList className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm text-purple-800 dark:text-purple-200">
                                      {notification.taskTitle}
                                    </p>
                                    <Badge variant="outline" className="text-xs border-purple-200 dark:border-purple-600 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 font-medium flex flex-col items-center justify-center text-center leading-tight min-w-[2.5rem] h-8">
                                      {splitTextForBadge(getCourseAbbreviation(notification.subject)).map((line, idx) => (
                                        <span key={idx} className="block">{line}</span>
                                      ))}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {TaskNotificationManager.getCourseNameById(notification.course)} • {formatDate(notification.timestamp)}
                                  </p>
                                  <div className="mt-2">
                                    {createSafeTaskLink(notification.taskId, '', translate('viewEvaluationButton'), 'evaluation')}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* 2. TAREAS PENDIENTES - SECOND POSITION */}
                      {(pendingTasks.filter(task => task.taskType === 'assignment' || !task.taskType).length > 0 || 
                        taskNotifications.filter(n => n.type === 'new_task' && (n.taskType === 'assignment' || !n.taskType)).length > 0) && (
                        <>
                          <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 dark:border-orange-500">
                            <h3 className="text-sm font-medium text-orange-800 dark:text-orange-200">
                              {translate('pendingTasks') || 'Tareas Pendientes'} ({pendingTasks.filter(task => task.taskType === 'assignment' || !task.taskType).length + 
                                taskNotifications.filter(n => n.type === 'new_task' && (n.taskType === 'assignment' || !n.taskType)).length})
                            </h3>
                          </div>
                          
                          {/* Existing pending tasks */}
                          {pendingTasks
                            .filter(task => task.taskType === 'assignment' || !task.taskType)
                            .slice(0, 2)
                            .map(task => (
                            <div key={`pending-task-${task.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-3">
                                <div className="bg-orange-100 dark:bg-orange-800 p-2 rounded-full">
                                  <Clock className="h-4 w-4 text-orange-600 dark:text-orange-300" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm text-orange-800 dark:text-orange-200">
                                      {task.title}
                                    </p>
                                    <Badge variant="outline" className="text-xs border-orange-200 dark:border-orange-600 text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 font-medium flex flex-col items-center justify-center text-center leading-tight min-w-[2.5rem] h-8">
                                      {splitTextForBadge(getCourseAbbreviation(task.subject)).map((line, idx) => (
                                        <span key={idx} className="block">{line}</span>
                                      ))}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {TaskNotificationManager.getCourseNameById(task.course)} • {formatDate(task.dueDate)}
                                  </p>
                                  <div className="mt-2">
                                    {createSafeTaskLink(task.id, '', undefined, 'task')}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* New task notifications */}
                          {taskNotifications
                            .filter(n => n.type === 'new_task' && (n.taskType === 'assignment' || !n.taskType))
                            .slice(0, 3 - pendingTasks.filter(task => task.taskType === 'assignment' || !task.taskType).length)
                            .map(notification => (
                            <div key={`new-task-${notification.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-3">
                                <div className="bg-orange-100 dark:bg-orange-800 p-2 rounded-full">
                                  <Clock className="h-4 w-4 text-orange-600 dark:text-orange-300" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm text-orange-800 dark:text-orange-200">
                                      {notification.taskTitle}
                                    </p>
                                    <Badge variant="outline" className="text-xs border-orange-200 dark:border-orange-600 text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 font-medium flex flex-col items-center justify-center text-center leading-tight min-w-[2.5rem] h-8">
                                      {splitTextForBadge(getCourseAbbreviation(notification.subject)).map((line, idx) => (
                                        <span key={idx} className="block">{line}</span>
                                      ))}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {TaskNotificationManager.getCourseNameById(notification.course)} • {formatDate(notification.timestamp)}
                                  </p>
                                  <div className="mt-2">
                                    {createSafeTaskLink(notification.taskId, '', undefined, 'task')}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* 3. COMENTARIOS NO LEÍDOS - THIRD POSITION */}
                      {unreadComments.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-500">
                            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                              {translate('unreadComments') || 'Comentarios No Leídos'} ({unreadComments.length})
                            </h3>
                          </div>
                          
                          {unreadComments.slice(0, 3).map(comment => (
                            <div key={`unread-comment-${comment.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-3">
                                <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-full">
                                  <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm">
                                      {comment.task?.title || 'Sin título'}
                                    </p>
                                    <Badge variant="outline" className="text-xs border-blue-200 dark:border-blue-600 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 font-medium flex flex-col items-center justify-center text-center leading-tight min-w-[2.5rem] h-8">
                                      {splitTextForBadge(getCourseAbbreviation(comment.task?.subject || 'CNT')).map((line, idx) => (
                                        <span key={idx} className="block">{line}</span>
                                      ))}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {comment.comment}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {comment.task?.courseSectionId ? TaskNotificationManager.getCourseNameById(comment.task.courseSectionId) : 
                                     comment.task?.course ? TaskNotificationManager.getCourseNameById(comment.task.course) : 'Sin curso'} • {formatDate(comment.timestamp)}
                                  </p>
                                  <div className="mt-2">
                                    {createSafeCommentLink(comment.taskId, comment.id, translate('viewComment'))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}

                          {unreadComments.length > 3 && (
                            <div className="px-4 py-3 text-center">
                              <Link 
                                href="/dashboard/tareas" 
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Ver todos los comentarios ({unreadComments.length})
                              </Link>
                            </div>
                          )}
                        </>
                      )}

                      {/* Grade and other notifications (except new_task) */}
                      {taskNotifications.filter(n => n.type !== 'new_task').length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400 dark:border-green-500">
                            <h3 className="text-sm font-medium text-green-800 dark:text-green-200">
                              Calificaciones y Comentarios ({taskNotifications.filter(n => n.type !== 'new_task').length})
                            </h3>
                          </div>
                          
                          {taskNotifications.filter(n => n.type !== 'new_task').map(notification => (
                            <div key={`grade-comment-${notification.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-full ${
                                  notification.type === 'grade_received' 
                                    ? 'bg-green-100 dark:bg-green-800' 
                                    : 'bg-blue-100 dark:bg-blue-800'
                                }`}>
                                  {notification.type === 'grade_received' ? (
                                    <ClipboardCheck className="h-4 w-4 text-green-600 dark:text-green-300" />
                                  ) : (
                                    <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm">
                                      {notification.type === 'grade_received'
                                        ? translate('reviewGrade')
                                        : translate('newTeacherComment')
                                      }
                                    </p>
                                    <Badge variant="outline" className={`text-xs font-medium flex flex-col items-center justify-center text-center leading-tight min-w-[2.5rem] h-8 ${
                                      notification.type === 'grade_received'
                                        ? 'border-green-200 dark:border-green-600 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30'
                                        : 'border-blue-200 dark:border-blue-600 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30'
                                    }`}>
                                      {splitTextForBadge(getCourseAbbreviation(notification.subject || 'CNT')).map((line, idx) => (
                                        <span key={idx} className="block">{line}</span>
                                      ))}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {notification.type === 'grade_received' && notification.grade
                                      ? `Calificación recibida: ${notification.grade}% en ${notification.taskTitle}`
                                      : `Comentario del profesor en: ${notification.taskTitle}`
                                    }
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {TaskNotificationManager.getCourseNameById(notification.course)} • {formatDate(notification.timestamp)}
                                  </p>
                                  <div className="mt-2">
                                    {createSafeTaskLink(notification.taskId, '', `Ver ${notification.type === 'grade_received' ? 'Calificación' : 'Comentario'}`, notification.type === 'grade_received' ? 'evaluation' : 'task')}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Guardian: Communications Section */}
              {user?.role === 'guardian' && (
                <div>
                  {(() => {
                    // Calcular comunicaciones no leídas para mostrar estado correcto
                    const unreadComms = studentCommunications.filter(c => {
                      const studentId = c.studentInfo?.id;
                      const readByKey = studentId ? `${user.id}_forStudent_${studentId}` : user.id;
                      return !((c.readBy||[]).includes(readByKey)) && !((c.readBy||[]).includes(user?.id));
                    });
                    
                    if (unreadComms.length === 0) {
                      return (
                    <div className="py-8 px-6 text-center">
                      <div className="relative">
                        <div className="mx-auto w-24 h-24 mb-6 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full flex items-center justify-center shadow-lg">
                          <div className="w-16 h-16 bg-gradient-to-br from-green-200 to-emerald-200 dark:from-green-800/40 dark:to-emerald-800/40 rounded-full flex items-center justify-center">
                            <span className="text-2xl animate-bounce">👨‍👩‍👧</span>
                          </div>
                        </div>
                        <div className="space-y-3 mb-6">
                          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                            {translate('allCaughtUpTitle') || '¡Todo al día!'}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-300 text-sm">
                            {translate('noNotificationsPending') || 'Sin notificaciones pendientes'}
                          </p>
                        </div>
                      </div>
                    </div>
                      );
                    }
                    
                    return (
                    <div className="divide-y divide-border">
                      {/* COMUNICACIONES - Para apoderados - MISMO FORMATO QUE ESTUDIANTE */}
                      <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-500">
                        <h3 className="text-sm font-medium text-red-800 dark:text-red-200 flex items-center gap-2">
                          <Megaphone className="h-4 w-4" />
                          {translate('communicationsSection') || 'Comunicaciones'} ({unreadComms.length})
                        </h3>
                      </div>
                      {studentCommunications.map(comm => {
                        const coursesRaw = typeof window !== 'undefined' ? localStorage.getItem('smart-student-courses') : null;
                        const sectionsRaw = typeof window !== 'undefined' ? localStorage.getItem('smart-student-sections') : null;
                        const courses = coursesRaw ? JSON.parse(coursesRaw) : [];
                        const sections = sectionsRaw ? JSON.parse(sectionsRaw) : [];
                        const courseName = comm.targetCourseName || courses.find((c: any) => c.id === comm.targetCourse)?.name || '';
                        const sectionName = comm.targetSectionName || sections.find((s: any) => s.id === comm.targetSection)?.name || '';
                        const csLabel = [courseName, sectionName].filter(Boolean).join(' ');
                        const isSlideShare = !!(comm?.attachment?.type === 'slide');
                        const defaultShareMsgs = [
                          'El profesor ha compartido una presentación de clase.',
                          'The teacher has shared a class presentation.'
                        ];
                        const studentInfo = comm.studentInfo;
                        
                        return (
                          <div key={comm.id} className="p-4 hover:bg-muted/50">
                            <div className="flex items-start gap-3">
                              <div className="bg-red-100 dark:bg-red-800 p-2 rounded-full">
                                <Megaphone className="h-4 w-4 text-red-600 dark:text-red-300" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  {/* Título dividido en 2 líneas: prefijo y tema - IGUAL QUE ESTUDIANTE */}
                                  <div className="min-w-0 flex-1">
                                    {(() => {
                                      const raw = String(comm.title || '');
                                      const parts = raw.split(':');
                                      const prefix = parts.shift()?.trim() || raw;
                                      const topic = parts.join(':').trim();
                                      return (
                                        <div className="text-red-800 dark:text-red-200">
                                          <span className="block font-medium text-sm truncate">{prefix}</span>
                                          {topic && (
                                            <span className="block text-[13px] text-red-700 dark:text-red-300 break-words">
                                              {topic}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  {/* Badge de estado - MISMO FORMATO QUE ESTUDIANTE */}
                                  {(() => {
                                    const studentId = comm.studentInfo?.id;
                                    const readByKey = studentId ? `${user.id}_forStudent_${studentId}` : user.id;
                                    const isUnread = !((comm.readBy||[]).includes(readByKey)) && !((comm.readBy||[]).includes(user?.id));
                                    return (
                                      <Badge variant="outline" className={`shrink-0 text-xs ${isUnread ? 'border-red-300 text-red-700 bg-red-50 dark:border-red-600 dark:text-red-300 dark:bg-red-900/30' : 'border-gray-200 text-gray-600 bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:bg-gray-900/20'}`}>
                                        {isUnread ? translate('unreadCommunication') || 'Sin leer' : translate('readCommunication') || 'Leído'}
                                      </Badge>
                                    );
                                  })()}
                                </div>
                                {/* Para apoderados: mostrar nombre del estudiante */}
                                {studentInfo && (
                                  <p className="text-xs text-purple-600 dark:text-purple-300 mt-1 font-medium truncate">
                                    👤 {studentInfo.name}{studentInfo.courseName ? ` (${studentInfo.courseName} ${studentInfo.sectionName || ''})` : ''}
                                  </p>
                                )}
                                {/* Meta: curso-sección en una línea y debajo profesor • fecha */}
                                {csLabel && !studentInfo ? (
                                  <p className="text-xs text-muted-foreground mt-1 truncate">
                                    <span className="font-medium text-red-700 dark:text-red-300">{csLabel}</span>
                                  </p>
                                ) : null}
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {getDisplayNameById(comm.senderId)} • {formatDate(comm.createdAt)}
                                </p>
                                {/* Adelanto del contenido para mejor claridad */}
                                {comm.content && !isSlideShare && !defaultShareMsgs.includes(String(comm.content).trim()) ? (
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2 break-words">
                                    {comm.content}
                                  </p>
                                ) : null}
                                <div className="mt-2">
                                  <Link href={`/dashboard/comunicaciones?commId=${encodeURIComponent(comm.id)}#open`} className="inline-block mt-1 text-xs text-red-600 dark:text-red-300 hover:underline" onClick={(e) => {
                                    try {
                                      if (!user?.id) return;
                                      const raw = localStorage.getItem('smart-student-communications');
                                      if (!raw) return;
                                      const list = JSON.parse(raw);
                                      
                                      // Extraer ID original y studentId si es un ID modificado con _studentId
                                      let originalCommId = comm.id;
                                      let extractedStudentId = comm.studentInfo?.id;
                                      
                                      if (comm.id.includes('_')) {
                                        const parts = comm.id.split('_');
                                        if (parts.length >= 2) {
                                          const lastPart = parts[parts.length - 1];
                                          if (lastPart.length > 10 || lastPart.includes('-')) {
                                            originalCommId = parts.slice(0, -1).join('_');
                                            extractedStudentId = extractedStudentId || lastPart;
                                          }
                                        }
                                      }
                                      
                                      // Usar identificador compuesto
                                      const readByKey = extractedStudentId 
                                        ? `${user.id}_forStudent_${extractedStudentId}` 
                                        : user.id;
                                      
                                      const idx = list.findIndex((c: any) => c.id === originalCommId);
                                      if (idx !== -1 && !(list[idx].readBy || []).includes(readByKey)) {
                                        list[idx].readBy = [...(list[idx].readBy || []), readByKey];
                                        localStorage.setItem('smart-student-communications', JSON.stringify(list));
                                        
                                        loadStudentCommunications();
                                        window.dispatchEvent(new CustomEvent('studentCommunicationsUpdated'));
                                        window.dispatchEvent(new CustomEvent('updateDashboardCounts', {
                                          detail: { userRole: 'guardian' }
                                        }));
                                      }
                                    } catch (err) {
                                      console.error('Error marking communication as read:', err);
                                    }
                                  }}>
                                    {translate('viewCommunicationButton') || 'Ver comunicación'}
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    );
                  })()}
                </div>
              )}
              
              {/* Teacher: Submissions to review */}
              {user?.role === 'teacher' && (
                <div>
                  {/* NUEVO: Asistencia pendiente (solo se muestra si hay pendientes) */}
                  {pendingAttendanceTotal > 0 && (
                  <div className="divide-y divide-border rounded-md ring-1 ring-indigo-200/60 dark:ring-indigo-800/40 overflow-hidden bg-gradient-to-b from-indigo-50/40 dark:from-indigo-900/10 to-transparent">
                    {/* Encabezado con estilo dinámico según ATTENDANCE_COLOR */}
                    <div className={`px-4 py-2 ${getHeaderBgClass(ATTENDANCE_COLOR)} ${getHeaderBorderClass(ATTENDANCE_COLOR)} rounded-t-md shadow-sm ring-1 ring-inset ring-indigo-200/60 dark:ring-indigo-700/40` }>
                      <h3 className={`text-sm font-semibold ${getTitleTextClass(ATTENDANCE_COLOR)} flex items-center gap-2`}>
                        <ClipboardList className={`h-4 w-4 ${getIconTextClass(ATTENDANCE_COLOR)}`} />
                        Asistencia {pendingAttendanceTotal > 0 ? `(${pendingAttendanceTotal})` : ''}
                      </h3>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start gap-2">
                        <div className={`${getIconBgClass(ATTENDANCE_COLOR)} p-2 rounded-full ring-1 ring-inset ring-indigo-200/60 dark:ring-indigo-700/50`}>
                          <ClipboardList className={`h-4 w-4 ${getIconTextClass(ATTENDANCE_COLOR)}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className={`font-medium text-sm ${getBodyTextClass(ATTENDANCE_COLOR)}`}>Días pendientes por curso</p>
                            {pendingAttendanceTotal > 0 && (
                              <Badge className={`text-xs ${getBadgeBgClass(ATTENDANCE_COLOR)} shadow-sm`}>{pendingAttendanceTotal > 99 ? '99+' : pendingAttendanceTotal}</Badge>
                            )}
                          </div>
                          {pendingAttendance.length === 0 ? (
                            <p className="text-sm text-muted-foreground mt-1">No hay asistencia pendiente</p>
                          ) : (
                            <ul className="mt-2 space-y-1">
                              {pendingAttendance.map((item) => (
                                <li key={item.id} className={`text-sm ${getBodyTextClass(ATTENDANCE_COLOR)} flex items-center justify-between`}>
                                  <div className="flex items-center min-w-0">
                                    <span className="mr-2">•</span>
                                    <span className="truncate" title={item.label}>{item.label}</span>
                                  </div>
                                  <Badge className={`ml-2 shrink-0 text-xs ${getBadgeBgClass(ATTENDANCE_COLOR)} shadow-sm`} title={`${item.count} día(s) pendiente(s)`}>
                                    {item.count > 99 ? '99+' : item.count}
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                          )}
                          <Link href="/dashboard/asistencia" className={`inline-block mt-2 text-xs ${getLinkTextClass(ATTENDANCE_COLOR)} hover:underline`}>
                            Ir a Asistencia
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}

                  {(studentSubmissions.length === 0 && pendingGrading.length === 0 && unreadStudentComments.length === 0 && taskNotifications.length === 0 && pendingAttendanceTotal === 0) ? (
                    <div className="py-8 px-6 text-center">
                      {/* Contenedor principal con animación sutil */}
                      <div className="relative">
                        {/* Círculo de fondo con gradiente profesional */}
                        <div className="mx-auto w-24 h-24 mb-6 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-full flex items-center justify-center shadow-lg">
                          <div className="w-16 h-16 bg-gradient-to-br from-blue-200 to-indigo-200 dark:from-blue-800/40 dark:to-indigo-800/40 rounded-full flex items-center justify-center">
                            <span className="text-2xl animate-bounce">👨‍🏫</span>
                          </div>
                        </div>
                        
                        {/* Mensaje principal */}
                        <div className="space-y-3 mb-6">
                          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200">
                            {translate('workCompletedTitle')}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-300 text-sm">
                            {translate('noSubmissionsPendingMessage')}
                          </p>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">
                            {translate('perfectTimeMessage')}
                          </p>
                        </div>
                        
                        {/* Iconos con checks - representando todo gestionado */}
                        <div className="flex justify-center items-center space-x-6 mb-4">
                          {/* Evaluaciones revisadas */}
                          <div className="flex flex-col items-center space-y-2">
                            <div className="relative">
                              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/40 rounded-full flex items-center justify-center">
                                <ClipboardCheck className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                              </div>
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs">✓</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{translate('evaluationsSection')}</span>
                          </div>
                          
                          {/* Entregas calificadas */}
                          <div className="flex flex-col items-center space-y-2">
                            <div className="relative">
                              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/40 rounded-full flex items-center justify-center">
                                <ClipboardList className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                              </div>
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs">✓</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{translate('submissionsSection')}</span>
                          </div>
                          
                          {/* Comentarios respondidos */}
                          <div className="flex flex-col items-center space-y-2">
                            <div className="relative">
                              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                                <MessageSquare className="h-6 w-6 text-green-600 dark:text-green-400" />
                              </div>
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs">✓</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{translate('commentsSection')}</span>
                          </div>
                        </div>
                        
                        {/* Mensaje motivacional para profesores */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                          <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                            {translate('excellentManagementMessage')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {/* 1. EVALUACIONES PENDIENTES DE CALIFICAR - PRIMER LUGAR */}
                      {(pendingGrading.filter(notif => notif.taskType === 'evaluation').length > 0 ||
                        taskNotifications.filter(notif => 
                          notif.type === 'pending_grading' && 
                          notif.fromUsername === 'system' &&
                          notif.taskType === 'evaluation' &&
                          // ✅ MISMA CONDICIÓN: Solo mostrar sección si hay del sistema sin entregas
                          !pendingGrading.some(pendingNotif => 
                            pendingNotif.taskId === notif.taskId && 
                            pendingNotif.taskType === 'evaluation'
                          )
                        ).length > 0) && (
                        <>
                          <div className="px-4 py-2 bg-purple-100 dark:bg-purple-900/10 border-l-4 border-purple-500 dark:border-purple-600">
                            <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300">
                              {translate('pendingEvaluations') || 'Evaluaciones Pendientes'} ({
                                pendingGrading.filter(notif => notif.taskType === 'evaluation').length +
                                taskNotifications.filter(notif => 
                                  notif.type === 'pending_grading' && 
                                  notif.fromUsername === 'system' &&
                                  notif.taskType === 'evaluation' &&
                                  // ✅ MISMO FILTRO: Solo contar las del sistema si NO hay entregas
                                  !pendingGrading.some(pendingNotif => 
                                    pendingNotif.taskId === notif.taskId && 
                                    pendingNotif.taskType === 'evaluation'
                                  )
                                ).length
                              })
                            </h3>
                          </div>
                          
                          {/* Evaluaciones pendientes del sistema (recién creadas) - Solo mostrar si NO hay entregas */}
                          {taskNotifications
                            .filter(notif => 
                              notif.type === 'pending_grading' && 
                              notif.fromUsername === 'system' &&
                              notif.taskType === 'evaluation' &&
                              // ✅ NUEVA CONDICIÓN: Solo mostrar si NO hay entregas de estudiantes para esta tarea
                              !pendingGrading.some(pendingNotif => 
                                pendingNotif.taskId === notif.taskId && 
                                pendingNotif.taskType === 'evaluation'
                              )
                            )
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map(notif => (
                            <div key={`teacher-pending-eval-system-${notif.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-2">
                                <div className="bg-purple-100 dark:bg-purple-800 p-2 rounded-full">
                                  <Clock className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm">
                                      {notif.taskTitle}
                                    </p>
                                    <Badge variant="outline" className="text-xs border-purple-200 dark:border-purple-600 text-purple-700 dark:text-purple-300 flex flex-col items-center justify-center text-center leading-tight">
                                      {getCourseAbbreviation(notif.subject)}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {TaskNotificationManager.getCourseNameById(notif.course)} • {formatDate(notif.timestamp)}
                                  </p>
                                  {createSafeTaskLink(notif.taskId, '', translate('viewEvaluation'), 'evaluation')}
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          {/* Evaluaciones pendientes de calificar (entregas de estudiantes) */}
                          {pendingGrading
                            .filter(notif => notif.taskType === 'evaluation')
                            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) // Orden por fecha de creación
                            .map(notif => (
                            <div key={`teacher-pending-eval-grade-${notif.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-2">
                                <div className="bg-purple-100 dark:bg-purple-800 p-2 rounded-full">
                                  <ClipboardList className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm">
                                      {notif.taskTitle}
                                    </p>
                                    <Badge variant="outline" className="text-xs border-purple-200 dark:border-purple-600 text-purple-700 dark:text-purple-300 flex flex-col items-center justify-center text-center leading-tight">
                                      {getCourseAbbreviation(notif.subject)}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {TaskNotificationManager.getCourseNameById(notif.course)} • {formatDate(notif.timestamp)}
                                  </p>
                                  {createSafeTaskLink(notif.taskId, '', translate('reviewEvaluation'), 'evaluation')}
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* 2. EVALUACIONES COMPLETADAS POR ESTUDIANTES - SEGUNDO LUGAR */}
                      {taskNotifications.filter(notif => 
                        (notif.type === 'task_completed' && notif.taskType === 'evaluation') ||
                        notif.type === 'evaluation_completed'
                        // 🔥 CORREGIDO: Las evaluaciones no se "califican", solo se revisan resultados
                        // Eliminamos el filtro isTaskAlreadyGraded para evaluaciones
                      ).length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-purple-100 dark:bg-purple-900/10 border-l-4 border-gray-300 dark:border-gray-500">
                            <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300">
                              {translate('evaluationsCompleted') || 'Evaluaciones Completadas'} ({taskNotifications.filter(notif => 
                                (notif.type === 'task_completed' && notif.taskType === 'evaluation') ||
                                notif.type === 'evaluation_completed'
                              ).length})
                            </h3>
                          </div>
                          {taskNotifications
                            .filter(notif => 
                              (notif.type === 'task_completed' && notif.taskType === 'evaluation') ||
                              notif.type === 'evaluation_completed'
                            )
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map(notif => {
                              console.log('🔍 [DEBUG] Rendering evaluation completed notification:', notif);
                              return (
                            <div key={`teacher-eval-completed-${notif.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-2">
                                <div className="bg-purple-50 dark:bg-purple-700/30 p-2 rounded-full">
                                  <ClipboardList className="h-4 w-4 text-purple-700 dark:text-purple-200" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm">
                                      {notif.fromDisplayName || notif.fromUsername}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs border-purple-200 dark:border-purple-500 text-purple-600 dark:text-purple-400 flex flex-col items-center justify-center text-center leading-tight">
                                        {getCourseAbbreviation(notif.subject || 'CNT')}
                                      </Badge>
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {translate('studentCompletedEvaluation') || 'Completó la evaluación'}: {notif.taskTitle || 'Evaluación'}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {formatDate(notif.timestamp)}
                                  </p>
                                  {createViewResultsLink(notif.taskId, notif.id)}
                                </div>
                              </div>
                            </div>
                          )})}
                        </>
                      )}

                      {/* 2. TAREAS PENDIENTES DE CALIFICAR - SEGUNDO LUGAR */}
                      {pendingGrading.filter(notif => notif.taskType === 'assignment').length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 dark:border-orange-500">
                            <h3 className="text-sm font-medium text-orange-800 dark:text-orange-200">
                              {translate('pendingTasks') || 'Tareas Pendientes'} ({pendingGrading.filter(notif => notif.taskType === 'assignment').length})
                            </h3>
                          </div>
                          
                          {/* Tareas pendientes del sistema (recién creadas) */}
                          {pendingGrading
                            .filter(notif => notif.taskType === 'assignment')
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map(notif => (
                            <div key={`teacher-pending-task-${notif.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-2">
                                <div className="bg-orange-100 dark:bg-orange-800 p-2 rounded-full">
                                  <Clock className="h-4 w-4 text-orange-600 dark:text-orange-300" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm">
                                      {notif.taskTitle}
                                    </p>
                                    <Badge variant="outline" className="text-xs border-orange-200 dark:border-orange-600 text-orange-700 dark:text-orange-300 flex flex-col items-center justify-center text-center leading-tight">
                                      {getCourseAbbreviation(notif.subject)}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {TaskNotificationManager.getCourseNameById(notif.course)} • {formatDate(notif.timestamp)}
                                  </p>
                                  {createSafeTaskLink(notif.taskId, '', translate('viewTask'), 'task')}
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* 4. TAREAS COMPLETADAS POR ESTUDIANTES - CUARTO LUGAR */}
                      {taskNotifications.filter(notif => 
                        notif.type === 'task_completed' && 
                        notif.taskType === 'assignment' &&
                        // 🔥 NUEVO FILTRO: Solo mostrar si la tarea NO ha sido calificada aún
                        !isTaskAlreadyGraded(notif.taskId, notif.fromUsername)
                      ).length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 dark:border-orange-500">
                            <h3 className="text-sm font-medium text-orange-800 dark:text-orange-200">
                              {translate('completedTasks') || 'Tareas Completadas'} ({taskNotifications.filter(notif => 
                                notif.type === 'task_completed' && 
                                notif.taskType === 'assignment' &&
                                !isTaskAlreadyGraded(notif.taskId, notif.fromUsername)
                              ).length})
                            </h3>
                          </div>
                          {taskNotifications
                            .filter(notif => 
                              notif.type === 'task_completed' && 
                              notif.taskType === 'assignment' &&
                              !isTaskAlreadyGraded(notif.taskId, notif.fromUsername)
                            )
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map(notif => (
                            <div key={`teacher-task-completed-${notif.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-2">
                                <div className="bg-orange-100 dark:bg-orange-800/40 p-2 rounded-full">
                                  <ClipboardCheck className="h-4 w-4 text-orange-800 dark:text-orange-100" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm">
                                      {notif.fromDisplayName || notif.fromUsername}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-300 flex flex-col items-center justify-center text-center leading-tight">
                                        {getCourseAbbreviation(notif.subject)}
                                      </Badge>
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {translate('completedTask') || 'Completó la tarea'}: {notif.taskTitle}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {TaskNotificationManager.getCourseNameById(notif.course)} • {formatDate(notif.timestamp)}
                                  </p>
                                  {createSafeTaskLink(notif.taskId, '', translate('viewTask'), 'task')}
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* 5. ENTREGAS INDIVIDUALES DE ESTUDIANTES */}
                      {taskNotifications.filter(notif => 
                        notif.type === 'task_submission' &&
                        // 🔥 NUEVO FILTRO: Solo mostrar entregas que NO han sido calificadas aún
                        !isTaskAlreadyGraded(notif.taskId, notif.fromUsername)
                      ).length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 border-l-4 border-orange-500 dark:border-orange-600">
                            <h3 className="text-sm font-medium text-orange-900 dark:text-orange-100">
                              {translate('completedTasks') || 'Tareas Completadas'} ({taskNotifications.filter(notif => 
                                notif.type === 'task_submission' &&
                                !isTaskAlreadyGraded(notif.taskId, notif.fromUsername)
                              ).length})
                            </h3>
                          </div>
                          {taskNotifications
                            .filter(notif => 
                              notif.type === 'task_submission' &&
                              !isTaskAlreadyGraded(notif.taskId, notif.fromUsername)
                            )
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map(notif => (
                            <div key={`teacher-task-submission-${notif.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-2">
                                <div className="bg-orange-100 dark:bg-orange-800/40 p-2 rounded-full">
                                  <ClipboardCheck className="h-4 w-4 text-orange-800 dark:text-orange-100" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm">
                                      {notif.fromDisplayName || notif.fromUsername}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-300 flex flex-col items-center justify-center text-center leading-tight">
                                        {getCourseAbbreviation(notif.subject)}
                                      </Badge>
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {translate('submittedTask') || 'Entregó la tarea'}: {notif.taskTitle}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {TaskNotificationManager.getCourseNameById(notif.course)} • {formatDate(notif.timestamp)}
                                  </p>
                                  {createSafeTaskLink(notif.taskId, '', translate('reviewTask') || 'Revisar Tarea', 'task')}
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* 🚫 ELIMINADO: Sección de entregas de estudiantes - ya no se muestra como sección separada */}
                      {/* La funcionalidad de revisar entregas ahora se maneja a través de las notificaciones del sistema */}

                      {/* Sección de comentarios no leídos de estudiantes */}
                      {unreadStudentComments.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-500">
                            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                              {translate('unreadStudentComments') || 'Comentarios No Leídos'} ({unreadStudentComments.length})
                            </h3>
                          </div>
                          {unreadStudentComments.map(comment => (
                            <div key={`teacher-student-comment-${comment.id}`} className="p-4 hover:bg-muted/50">
                              <div className="flex items-start gap-2">
                                <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-full">
                                  <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-sm">
                                      {comment.studentName || comment.studentUsername}
                                    </p>
                                    <Badge variant="outline" className="text-xs border-blue-200 dark:border-blue-600 text-blue-700 dark:text-blue-300 flex flex-col items-center justify-center text-center leading-tight">
                                      {getCourseAbbreviation(comment.task?.subject || 'Sin materia')}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Comentario en: {comment.task?.title || 'Sin título'}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {comment.task?.course ? TaskNotificationManager.getCourseNameById(comment.task.course) : 'Sin curso'} • {formatDate(comment.timestamp)}
                                  </p>
                                  {createSafeCommentLink(comment.taskId, comment.id, translate('viewComment') || 'Ver Comentario')}
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
                </CardContent>
              </div>
            </ScrollArea>
          </Card>
        </PopoverContent>
      </Popover>
    </div>
  );
}
