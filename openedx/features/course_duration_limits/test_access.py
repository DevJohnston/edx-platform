# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from course_modes.tests.factories import CourseModeFactory
from courseware.views.views import CourseTabView
from django.test import Client, RequestFactory, TestCase
from django.contrib.messages.api import get_messages
from student.tests.factories import CourseEnrollmentFactory, UserFactory
from xmodule.modulestore.tests.django_utils import ModuleStoreTestCase
from xmodule.modulestore.tests.factories import CourseFactory

from student.models import User

class UserMessagesTestCase(ModuleStoreTestCase):
    
    def setUp(self):
        super(UserMessagesTestCase, self).setUp()
        self.user = UserFactory.create()
        self.course = CourseFactory.create()
        self.mode = CourseModeFactory.create(
            course_id=self.course.id,
            mode_slug="verified"
        )
        self.enrollment = CourseEnrollmentFactory(user=self.user, course_id=self.course.id)
        self.request_factory = RequestFactory()
        self.request = self.request_factory.get('/courses/{course_id}/course/'.format(course_id=self.course.id))
        self.request.user = self.user


    def test_something(self):
        # [REV Revisit]
        # todo: assume that audit learners are limited access learners
        # Create an instance of a GET request.
        # request = self.request_factory.get('/courses/{course_id}/course/'.format(course_id=self.course.id))
        # request =  EdxRestApiClient('http://test-server', jwt='test-token')
        response = CourseTabView.as_view()(self.request, self.course.id, 'courseware')
        messages = get_messages(self.request)
        import pdb; pdb.set_trace()
        print(request)
        self.assertTrue(False)

